
#include <PMS.h>
#include <SoftwareSerial.h>
#include <U8g2lib.h>
#include <SPI.h>

// PMS7003: sensor TXD -> UNO D2
SoftwareSerial pmsSerial(2, 3);
PMS pms(pmsSerial);
PMS::DATA data;

// 128x64 SSD1306, 4-wire hardware SPI, page buffer
// Constructor arguments: rotation, CS, DC, RESET
U8G2_SSD1306_128X64_NONAME_1_4W_HW_SPI display(
  U8G2_R0, 10, 9, 8
);

// Indicative particulate sub-index calculation
int subAQI(float concentration,
           const int lowC[], const int highC[],
           const int lowA[], const int highA[],
           int count) {
  for (int i = 0; i < count; i++) {
    if (concentration >= lowC[i] &&
        concentration <= highC[i]) {
      float result = lowA[i] +
        (concentration - lowC[i]) *
        (highA[i] - lowA[i]) /
        (highC[i] - lowC[i]);

      return (int)(result + 0.5);
    }
  }

  return 500;
}

int pm25AQI(int pm) {
  const int lc[] = {0, 31, 61, 91, 121};
  const int hc[] = {30, 60, 90, 120, 250};
  const int la[] = {0, 51, 101, 201, 301};
  const int ha[] = {50, 100, 200, 300, 400};

  return subAQI(pm, lc, hc, la, ha, 5);
}

int pm10AQI(int pm) {
  const int lc[] = {0, 51, 101, 251, 351};
  const int hc[] = {50, 100, 250, 350, 430};
  const int la[] = {0, 51, 101, 201, 301};
  const int ha[] = {50, 100, 200, 300, 400};

  return subAQI(pm, lc, hc, la, ha, 5);
}

const char* category(int aqi) {
  if (aqi <= 50)  return "Good";
  if (aqi <= 100) return "Satisfactory";
  if (aqi <= 200) return "Moderate";
  if (aqi <= 300) return "Poor";
  if (aqi <= 400) return "Very Poor";
  return "Severe";
}

void showDisplay(bool valid, int aqi,
                 int pm25, int pm10) {
  char line[24];

  display.firstPage();
  do {
    display.setFont(u8g2_font_6x10_tf);
    display.drawStr(0, 10, "AIR QUALITY MONITOR");
    display.drawHLine(0, 13, 128);

    if (!valid) {
      display.drawStr(0, 32, "Waiting for PMS7003");
      display.drawStr(0, 47, "Check power and TXD");
    } else {
      snprintf(line, sizeof(line), "AQI: %d", aqi);
      display.setFont(u8g2_font_helvB14_tf);
      display.drawStr(0, 31, line);

      display.setFont(u8g2_font_6x10_tf);
      display.drawStr(0, 43, category(aqi));

      snprintf(line, sizeof(line), "PM2.5: %d ug/m3", pm25);
      display.drawStr(0, 53, line);

      snprintf(line, sizeof(line), "PM10:  %d ug/m3", pm10);
      display.drawStr(0, 63, line);
    }
  } while (display.nextPage());
}

void setup() {
  Serial.begin(9600);
  pmsSerial.begin(9600);

  display.begin();
  showDisplay(false, 0, 0, 0);

  Serial.println("PMS7003 + OLED AQI Monitor");

  delay(3000);
  pms.wakeUp();
  pms.passiveMode();
}

void loop() {
  pms.requestRead();

  if (pms.read(data)) {
    int pm1  = data.PM_AE_UG_1_0;
    int pm25 = data.PM_AE_UG_2_5;
    int pm10 = data.PM_AE_UG_10_0;

    int aqi = max(pm25AQI(pm25), pm10AQI(pm10));

    Serial.println("------------------------");
    Serial.print("PM1.0: ");
    Serial.print(pm1);
    Serial.println(" ug/m3");

    Serial.print("PM2.5: ");
    Serial.print(pm25);
    Serial.println(" ug/m3");

    Serial.print("PM10:  ");
    Serial.print(pm10);
    Serial.println(" ug/m3");

    Serial.print("AQI: ");
    Serial.println(aqi);

    Serial.print("Category: ");
    Serial.println(category(aqi));

    showDisplay(true, aqi, pm25, pm10);
  } else {
    Serial.println("No data received from PMS7003");
    showDisplay(false, 0, 0, 0);
  }

  delay(5000);
}
