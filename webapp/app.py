"""
TUFAN — National AQI Portal & Environmental Intelligence Server
Includes CPCB 257-City Bulletin, Stubble Source Attribution, GRAP Mitigations, and CFD Telemetry
"""

import asyncio
import json
import os
import re
import threading
import time
from collections import deque
from datetime import datetime
from typing import Dict, List, Optional

import serial
import serial.tools.list_ports
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI(title="TUFAN — Environmental Intelligence Platform", version="5.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load CPCB Bulletin Dataset
APP_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(APP_DIR, "static")
CPCB_FILE = os.path.join(STATIC_DIR, "cpcb_bulletin.json")
CPCB_DATASET = []
if os.path.exists(CPCB_FILE):
    with open(CPCB_FILE, "r", encoding="utf-8") as f:
        CPCB_DATASET = json.load(f)

# Delhi NCT Detailed Monitoring Stations
DELHI_STATIONS = [
    {"name": "Anand Vihar", "lat": 28.6469, "lng": 77.3160, "aqi": 142, "category": "Moderate", "pollutant": "PM10", "type": "DPCC Continuous"},
    {"name": "Mundka", "lat": 28.6835, "lng": 77.0250, "aqi": 158, "category": "Moderate", "pollutant": "PM10", "type": "DPCC Industrial"},
    {"name": "Jahangirpuri", "lat": 28.7259, "lng": 77.1685, "aqi": 136, "category": "Moderate", "pollutant": "PM10", "type": "DPCC Station"},
    {"name": "Wazirpur", "lat": 28.6990, "lng": 77.1650, "aqi": 140, "category": "Moderate", "pollutant": "PM10", "type": "DPCC Industrial"},
    {"name": "Bawana", "lat": 28.7950, "lng": 77.0450, "aqi": 145, "category": "Moderate", "pollutant": "PM10", "type": "DPCC Station"},
    {"name": "Rohini", "lat": 28.7325, "lng": 77.1190, "aqi": 125, "category": "Moderate", "pollutant": "PM2.5", "type": "DPCC Station"},
    {"name": "Okhla Phase-II", "lat": 28.5308, "lng": 77.2713, "aqi": 128, "category": "Moderate", "pollutant": "PM10", "type": "DPCC Station"},
    {"name": "Punjabi Bagh", "lat": 28.6740, "lng": 77.1310, "aqi": 118, "category": "Moderate", "pollutant": "PM10", "type": "CPCB Station"},
    {"name": "ITO", "lat": 28.6312, "lng": 77.2410, "aqi": 115, "category": "Moderate", "pollutant": "PM10", "type": "CPCB Central"},
    {"name": "RK Puram", "lat": 28.5660, "lng": 77.1767, "aqi": 105, "category": "Moderate", "pollutant": "PM2.5", "type": "DPCC Station"},
    {"name": "Dwarka Sector 8", "lat": 28.5708, "lng": 77.0712, "aqi": 98, "category": "Satisfactory", "pollutant": "PM10", "type": "DPCC Station"},
    {"name": "Lodhi Road", "lat": 28.5910, "lng": 77.2270, "aqi": 82, "category": "Satisfactory", "pollutant": "PM2.5", "type": "IMD Station"},
    {"name": "IGI Airport (T3)", "lat": 28.5562, "lng": 77.1000, "aqi": 94, "category": "Satisfactory", "pollutant": "PM10", "type": "IMD Station"},
    {"name": "Sirifort", "lat": 28.5504, "lng": 77.2159, "aqi": 89, "category": "Satisfactory", "pollutant": "PM10", "type": "CPCB Station"},
]

# Source Attribution Data & Stubble Burning Diagnostics
SOURCE_ATTRIBUTION = {
    "current_split": {
        "labels": ["Vehicular Traffic", "Stubble Burning (Trans-boundary)", "Construction Dust", "Industrial Emissions", "Secondary Aerosols"],
        "percentages": [38, 29, 17, 12, 4],
        "colors": ["#2563eb", "#ea580c", "#ca8a04", "#7c3aed", "#64748b"]
    },
    "stubble_telemetry": {
        "satellite": "VIIRS / MODIS Real-Time Feed",
        "active_fire_count_48h": 1842,
        "punjab_fires": 1120,
        "haryana_fires": 542,
        "up_border_fires": 180,
        "wind_advection_vector": "North-West @ 18.5 km/h",
        "transboundary_influx_fraction": "29.4%",
        "boundary_layer_height_m": 480,
        "smoke_plume_trajectory": "NW to SE towards Delhi-NCR basin"
    },
    "weekly_trends": {
        "days": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        "traffic": [42, 45, 40, 48, 52, 36, 32],
        "stubble": [18, 22, 27, 34, 38, 31, 29],
        "construction": [20, 21, 19, 22, 24, 16, 12],
        "industrial": [16, 18, 17, 19, 18, 15, 14]
    }
}

# GRAP Mitigations & Active Site Violations State
GRAP_STATE = {
    "current_stage": "Stage II (Very Poor)",
    "delhi_average_aqi": 122,
    "highest_hotspot_aqi": 158,
    "active_violations": [
        {
            "id": "GRAP-DEL-01",
            "zone": "Mundka Industrial Area (Zone 11)",
            "aqi": 425,
            "status": "ALERT - THRESHOLD BREACH",
            "contractor": "DSIDC / Private Clusters",
            "action_mandated": "Deployment of 4x Anti-Smog Guns + Halt on unpaved handling",
            "status_chip": "Active Dispatch",
            "timestamp": "14:20"
        },
        {
            "id": "GRAP-DEL-02",
            "zone": "Anand Vihar ISBT & Trans-Yamuna Corridor",
            "aqi": 418,
            "status": "ALERT - CONGESTION DUST",
            "contractor": "DTC / PWD Maintenance",
            "action_mandated": "Mechanical sweeping + continuous water-sprinkler rotation",
            "status_chip": "Sprinkler En Route",
            "timestamp": "13:45"
        },
        {
            "id": "GRAP-DEL-03",
            "zone": "Bawana Industrial Sector 3",
            "aqi": 412,
            "status": "ALERT - EMISSION EXCEEDANCE",
            "contractor": "Bawana Infra Ltd",
            "action_mandated": "Inspection team dispatched + DG Set operation prohibited",
            "status_chip": "Stop-Work Notice",
            "timestamp": "12:10"
        },
        {
            "id": "GRAP-DEL-04",
            "zone": "Sarai Kale Khan RRTS Construction Hub",
            "aqi": 348,
            "status": "WARNING - DUST DISPERSION",
            "contractor": "NCRTC Project Division",
            "action_mandated": "100% dust-screen covering + hourly water misting",
            "status_chip": "Compliant Notice",
            "timestamp": "10:30"
        }
    ],
    "action_log": [
        {"time": "15:40", "action": "Water-Sprinkler Truck Unit 08 deployed to Anand Vihar ISBT corridor."},
        {"time": "14:15", "action": "Anti-Smog Gun Battery B activated at Mundka Industrial cluster."},
        {"time": "12:50", "action": "Stop-work advisory served to 3 unpaved cement batching units in Bawana."},
        {"time": "11:20", "action": "Enhanced parking surcharge initiated at 24 metro stations to curb vehicular volume."}
    ]
}


# Endpoints
@app.get("/api/bulletin")
async def get_bulletin_data():
    total = len(CPCB_DATASET)
    cats = {"Good": 0, "Satisfactory": 0, "Moderate": 0, "Poor": 0, "Very Poor": 0, "Severe": 0}
    for c in CPCB_DATASET:
        cat = c.get("category", "Moderate")
        cats[cat] = cats.get(cat, 0) + 1

    delhi_entry = next((c for c in CPCB_DATASET if c["city"] == "Delhi"), None)
    cleanest = min(CPCB_DATASET, key=lambda x: x["aqi"]) if CPCB_DATASET else None
    highest = max(CPCB_DATASET, key=lambda x: x["aqi"]) if CPCB_DATASET else None

    return {
        "bulletin_date": "Oct 10, 2026 @ 4 PM",
        "bulletin_period": "Average of past 24 hours",
        "total_cities": total,
        "category_counts": cats,
        "cleanest_city": cleanest,
        "highest_city": highest,
        "delhi_summary": delhi_entry,
        "cities": CPCB_DATASET,
        "delhi_stations": DELHI_STATIONS,
    }


@app.get("/api/sources")
async def get_source_attribution():
    return SOURCE_ATTRIBUTION


@app.get("/api/mitigations")
async def get_grap_mitigations():
    return GRAP_STATE


class DispatchRequest(BaseModel):
    zone_id: str
    action_type: str


@app.post("/api/mitigations/dispatch")
async def dispatch_mitigation_action(req: DispatchRequest):
    time_str = datetime.now().strftime("%H:%M")
    log_text = f"Manual dispatch triggered: {req.action_type} for {req.zone_id}."
    GRAP_STATE["action_log"].insert(0, {"time": time_str, "action": log_text})
    
    # Update violation status chip if matches
    for item in GRAP_STATE["active_violations"]:
        if item["id"] == req.zone_id:
            item["status_chip"] = f"Action: {req.action_type}"
            item["timestamp"] = time_str

    return {"status": "success", "log": log_text, "violations": GRAP_STATE["active_violations"]}


# Indoor Telemetry (Hardcoded 78 AQI - ESP32 PMS7003 Node)
INDOOR_TELEMETRY = {
    "device_id": "ESP32-PMS7003-INDOOR-01",
    "location": "Central Living & Workspace",
    "status": "Online",
    "aqi": 78,
    "category": "Satisfactory",
    "prominent_pollutant": "PM2.5",
    "color": "#92d050",
    "pm2_5": 24.8,
    "pm10": 49.2,
    "pm1_0": 11.5,
    "co2": 520,
    "tvoc": 0.08,
    "temperature": 23.5,
    "humidity": 48.2,
    "wifi_rssi": -58,
    "air_purifier_mode": "Eco Mode (Active)",
    "outdoor_aqi": 122,
    "purification_efficiency": "36.1%",
    "particles": {
        "p03": 1420,
        "p05": 380,
        "p10": 95,
        "p25": 22,
        "p50": 6,
        "p100": 1
    },
    "history_24h": [
        {"time": "00:00", "indoor_aqi": 74, "outdoor_aqi": 135},
        {"time": "03:00", "indoor_aqi": 72, "outdoor_aqi": 148},
        {"time": "06:00", "indoor_aqi": 76, "outdoor_aqi": 158},
        {"time": "09:00", "indoor_aqi": 80, "outdoor_aqi": 142},
        {"time": "12:00", "indoor_aqi": 79, "outdoor_aqi": 118},
        {"time": "15:00", "indoor_aqi": 77, "outdoor_aqi": 110},
        {"time": "16:00", "indoor_aqi": 78, "outdoor_aqi": 122}
    ]
}

@app.get("/api/indoor")
async def get_indoor_data():
    return INDOOR_TELEMETRY

@app.get("/api/telemetry/latest")
async def get_latest_telemetry():
    return INDOOR_TELEMETRY

app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
