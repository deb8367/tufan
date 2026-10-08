#include "PMS.h"

#include <MD_Parola.h>
#include <MD_MAX72xx.h>
#include <SPI.h>

// =====================================================
// MAX7219 4-IN-1 MATRIX
// =====================================================
//esp 32 dev v1.1 with 4 matrix display pms 7003 show only serial monitor

#define HARDWARE_TYPE MD_MAX72XX::FC16_HW
#define MAX_DEVICES 4

#define DATA_PIN 23
#define CLK_PIN 18
#define CS_PIN 5

// =====================================================
// PMS7003
// =====================================================

// PMS7003 TX → ESP32 GPIO16
#define PMS_RX 16

// ESP32 TX not connected
#define PMS_TX -1

// =====================================================
// OBJECTS
// =====================================================

MD_Parola myDisplay(
  HARDWARE_TYPE,
  DATA_PIN,
  CLK_PIN,
  CS_PIN,
  MAX_DEVICES
);

HardwareSerial pmsSerial(2);

PMS pms(pmsSerial);
PMS::DATA data;

char displayBuffer[20];

// =====================================================
// TIMING
// =====================================================

unsigned long lastPrintTime = 0;

// Print every 5 seconds
const unsigned long PRINT_INTERVAL = 5000;

// =====================================================
// STORE LATEST SENSOR VALUES
// =====================================================

int latestPM1 = 0;
int latestPM25 = 0;
int latestPM10 = 0;

bool sensorDataAvailable = false;

// =====================================================
// CPCB PM2.5 AQI
// =====================================================

int calculatePM25AQI(float concentration)
{
  if (concentration <= 30)
  {
    return round(
      ((50.0 - 0.0) / (30.0 - 0.0)) *
      (concentration - 0.0) + 0.0
    );
  }

  else if (concentration <= 60)
  {
    return round(
      ((100.0 - 51.0) / (60.0 - 31.0)) *
      (concentration - 31.0) + 51.0
    );
  }

  else if (concentration <= 90)
  {
    return round(
      ((200.0 - 101.0) / (90.0 - 61.0)) *
      (concentration - 61.0) + 101.0
    );
  }

  else if (concentration <= 120)
  {
    return round(
      ((300.0 - 201.0) / (120.0 - 91.0)) *
      (concentration - 91.0) + 201.0
    );
  }

  else if (concentration <= 250)
  {
    return round(
      ((400.0 - 301.0) / (250.0 - 121.0)) *
      (concentration - 121.0) + 301.0
    );
  }

  else
  {
    int aqi = round(
      ((500.0 - 401.0) / (500.0 - 251.0)) *
      (concentration - 251.0) + 401.0
    );

    return constrain(aqi, 401, 500);
  }
}

// =====================================================
// CPCB PM10 AQI
// =====================================================

int calculatePM10AQI(float concentration)
{
  if (concentration <= 50)
  {
    return round(
      ((50.0 - 0.0) / (50.0 - 0.0)) *
      (concentration - 0.0) + 0.0
    );
  }

  else if (concentration <= 100)
  {
    return round(
      ((100.0 - 51.0) / (100.0 - 51.0)) *
      (concentration - 51.0) + 51.0
    );
  }

  else if (concentration <= 250)
  {
    return round(
      ((200.0 - 101.0) / (250.0 - 101.0)) *
      (concentration - 101.0) + 101.0
    );
  }

  else if (concentration <= 350)
  {
    return round(
      ((300.0 - 201.0) / (350.0 - 251.0)) *
      (concentration - 251.0) + 201.0
    );
  }

  else if (concentration <= 430)
  {
    return round(
      ((400.0 - 301.0) / (430.0 - 351.0)) *
      (concentration - 351.0) + 301.0
    );
  }

  else
  {
    int aqi = round(
      ((500.0 - 401.0) / (600.0 - 431.0)) *
      (concentration - 431.0) + 401.0
    );

    return constrain(aqi, 401, 500);
  }
}

// =====================================================
// AQI CATEGORY
// =====================================================

const char* getAQICategory(int aqi)
{
  if (aqi <= 50)
    return "Good";

  else if (aqi <= 100)
    return "Satisfactory";

  else if (aqi <= 200)
    return "Moderate";

  else if (aqi <= 300)
    return "Poor";

  else if (aqi <= 400)
    return "Very Poor";

  else
    return "Severe";
}

// =====================================================
// SETUP
// =====================================================

void setup()
{
  // USB Serial Monitor
  Serial.begin(115200);

  delay(1000);

  Serial.println();
  Serial.println("================================");
  Serial.println(" ESP32 CPCB AIR QUALITY MONITOR");
  Serial.println("================================");

  // ---------------------------------------------------
  // PMS7003
  // ---------------------------------------------------

  pmsSerial.begin(
    9600,
    SERIAL_8N1,
    PMS_RX,
    PMS_TX
  );

  Serial.println("PMS7003 initialized");

  // ---------------------------------------------------
  // MAX7219
  // ---------------------------------------------------

  myDisplay.begin();

  // Minimum brightness
  myDisplay.setIntensity(0);

  myDisplay.displayClear();

  myDisplay.setTextAlignment(PA_CENTER);

  myDisplay.print("START");

  delay(2000);

  myDisplay.displayClear();

  Serial.println("MAX7219 initialized");
  Serial.println("System ready");
  Serial.println("Reading PMS7003...");
  Serial.println("--------------------------------");
}

// =====================================================
// LOOP
// =====================================================

void loop()
{
  // ===================================================
  // CONTINUOUSLY READ PMS7003
  // ===================================================

  if (pms.read(data))
  {
    latestPM1 = data.PM_AE_UG_1_0;
    latestPM25 = data.PM_AE_UG_2_5;
    latestPM10 = data.PM_AE_UG_10_0;

    sensorDataAvailable = true;
  }

  // ===================================================
  // PRINT EVERY 5 SECONDS
  // ===================================================

  if (millis() - lastPrintTime >= PRINT_INTERVAL)
  {
    lastPrintTime = millis();

    // -------------------------------------------------
    // If no PMS data received
    // -------------------------------------------------

    if (!sensorDataAvailable)
    {
      Serial.println("Waiting for PMS7003 data...");
      return;
    }

    // -------------------------------------------------
    // Calculate AQI
    // -------------------------------------------------

    int pm25AQI = calculatePM25AQI(latestPM25);
    int pm10AQI = calculatePM10AQI(latestPM10);

    // -------------------------------------------------
    // Find worst pollutant
    // -------------------------------------------------

    int overallAQI;
    const char* dominantPollutant;

    if (pm25AQI >= pm10AQI)
    {
      overallAQI = pm25AQI;
      dominantPollutant = "PM2.5";
    }
    else
    {
      overallAQI = pm10AQI;
      dominantPollutant = "PM10";
    }

    // -------------------------------------------------
    // SERIAL MONITOR
    // -------------------------------------------------

    Serial.println();
    Serial.println("========== AIR QUALITY ==========");

    Serial.print("PM1.0  : ");
    Serial.print(latestPM1);
    Serial.println(" ug/m3");

    Serial.print("PM2.5  : ");
    Serial.print(latestPM25);
    Serial.println(" ug/m3");

    Serial.print("PM10   : ");
    Serial.print(latestPM10);
    Serial.println(" ug/m3");

    Serial.println();

    Serial.print("PM2.5 AQI : ");
    Serial.println(pm25AQI);

    Serial.print("PM10 AQI  : ");
    Serial.println(pm10AQI);

    Serial.println();

    Serial.print("OVERALL AQI : ");
    Serial.println(overallAQI);

    Serial.print("WORST POLLUTANT : ");
    Serial.println(dominantPollutant);

    Serial.print("CATEGORY : ");
    Serial.println(getAQICategory(overallAQI));

    Serial.println("=================================");

    // -------------------------------------------------
    // MAX7219
    // -------------------------------------------------

    snprintf(
      displayBuffer,
      sizeof(displayBuffer),
      "AQI:%d",
      overallAQI
    );

    myDisplay.print(displayBuffer);
  }

  // Small delay so ESP32 isn't unnecessarily busy
  delay(10);
}
