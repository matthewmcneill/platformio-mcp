/*
 * Departures Board (c) 2025-2026 Gadec Software
 *
 * https://github.com/gadec-uk/departures-board
 *
 * Module: lib/boards/busBoard/src/busDataSource.cpp
 * Description: Implementation of busDataSource.
 */

#include "busDataSource.hpp"
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <logger.hpp>

#define UPD_SUCCESS 0
#define UPD_INCOMPLETE 1
#define UPD_UNAUTHORISED 2
#define UPD_HTTP_ERROR 3
#define UPD_TIMEOUT 4
#define UPD_NO_RESPONSE 5
#define UPD_DATA_ERROR 6
#define UPD_NO_CHANGE 7

#define PBT_START 0
#define PBT_HEADER 1
#define PBT_SERVICE 2
#define PBT_DESTINATION 3
#define PBT_SCHEDULED 4
#define PBT_EXPECTED 5

busDataSource::busDataSource() : callback(nullptr) {
    memset(&stationData, 0, sizeof(BusStop));
    lastErrorMsg[0] = '\0';
    busAtco[0] = '\0';
    busFilter[0] = '\0';
    cleanBusFilter[0] = '\0';
}

void busDataSource::configure(const char* atco, const char* filter, busDataSourceCallback cb) {
    if (atco) strncpy(busAtco, atco, sizeof(busAtco)-1);
    if (filter) strncpy(busFilter, filter, sizeof(busFilter)-1);
    callback = cb;
    cleanFilter(busFilter, cleanBusFilter, sizeof(cleanBusFilter));
}

int busDataSource::updateData() {
    unsigned long perfTimer = millis();
    long dataReceived = 0;
    bool bChunked = false;
    lastErrorMsg[0] = '\0';

    WiFiClientSecure httpsClient;
    httpsClient.setInsecure();
    httpsClient.setTimeout(5000);
    httpsClient.setConnectionTimeout(5000);
    stationData.boardChanged = false;

    int retryCounter = 0;
    while (!httpsClient.connect(apiHost, 443) && (retryCounter++ < 10)) {
        delay(200);
    }
    if (retryCounter >= 10) {
        strcpy(lastErrorMsg, "Connection timeout");
        LOG_WARN(lastErrorMsg);
        return UPD_NO_RESPONSE;
    }

    String request = "GET /stops/" + String(busAtco) + F("/departures HTTP/1.0\r\nHost: ") + String(apiHost) + F("\r\nConnection: close\r\n\r\n");
    httpsClient.print(request);
    if (callback) callback();
    
    unsigned long ticker = millis() + 800;
    retryCounter = 0;
    while(!httpsClient.available() && retryCounter++ < 40) {
        delay(200);
    }

    if (!httpsClient.available()) {
        httpsClient.stop();
        strcpy(lastErrorMsg, "Response timeout");
        LOG_WARN(lastErrorMsg);
        return UPD_TIMEOUT;
    }

    String statusLine = httpsClient.readStringUntil('\n');
    if (!statusLine.startsWith(F("HTTP/")) || statusLine.indexOf(F("200 OK")) == -1) {
        httpsClient.stop();
        if (statusLine.indexOf(F("401")) > 0 || statusLine.indexOf(F("429")) > 0) {
            strcpy(lastErrorMsg, "Not Authorized");
            return UPD_UNAUTHORISED;
        } else {
            strncpy(lastErrorMsg, statusLine.c_str(), sizeof(lastErrorMsg)-1);
            return UPD_HTTP_ERROR;
        }
    }

    while (httpsClient.connected() || httpsClient.available()) {
        String line = httpsClient.readStringUntil('\n');
        if (line == F("\r")) break;
        if (line.startsWith(F("Transfer-Encoding:")) && line.indexOf(F("chunked")) >= 0) bChunked = true;
    }

    unsigned long dataSendTimeout = millis() + 10000UL;
    id = 0;
    maxServicesRead = false;
    
    BusStop xBusStop;
    xBusStop.numServices = 0;
    for (int i=0; i<BUS_MAX_SERVICES; i++) {
        strcpy(xBusStop.service[i].destination, "Check front of bus");
        strcpy(xBusStop.service[i].sTime, "");
        strcpy(xBusStop.service[i].expectedTime, "");
    }

    int parseStep = PBT_START;
    int dataColumns = 0;
    bool serviceData = false;
    String serviceId;

    while((httpsClient.available() || httpsClient.connected()) && (millis() < dataSendTimeout) && (!maxServicesRead)) {
        while(httpsClient.available() && !maxServicesRead) {
            String line = httpsClient.readStringUntil('\n');
            dataReceived += line.length() + 1;
            line.trim();
            if (line.length()) {
                if (line.indexOf("</body>") >= 0) {
                    maxServicesRead = true;
                } else {
                    switch (parseStep) {
                        case PBT_START:
                            if (line.indexOf("<tr>") >= 0) parseStep = PBT_HEADER;
                            break;
                        case PBT_HEADER:
                            if (line.indexOf("</tr>") >= 0) {
                                parseStep = PBT_SERVICE;
                                serviceData = false;
                            }
                            else if (line.substring(0,1) == "<") dataColumns++;
                            break;
                        case PBT_SERVICE:
                            if (line.indexOf("</table>") >= 0) {
                                dataColumns = 0;
                                parseStep = PBT_START;
                            }
                            else if (line.indexOf("</td>") >= 0) parseStep = PBT_DESTINATION;
                            else if (line.substring(0,3) == "<td") serviceData = true;
                            else if (line.substring(0,7) == "<a href" && serviceData) {
                                serviceId = stripTag(line);
                                strncpy(xBusStop.service[id].routeNumber, serviceId.c_str(), BUS_MAX_LINE_NAME-1);
                            } else {
                                serviceId = line;
                                strncpy(xBusStop.service[id].routeNumber, serviceId.c_str(), BUS_MAX_LINE_NAME-1);
                            }
                            break;
                        case PBT_DESTINATION:
                            if (line.indexOf("</td>") >= 0) parseStep = PBT_SCHEDULED;
                            else if (line.substring(0,1) != "<") {
                                strncpy(xBusStop.service[id].destination, line.c_str(), BUS_MAX_LOCATION-1);
                            } else if (line.indexOf("class=\"vehicle\"") >= 0) {
                                String vehicle = stripTag(line);
                                int tikregsep = vehicle.indexOf(" - ");
                                if (tikregsep > 0) {
                                    vehicle = vehicle.substring(tikregsep+3);
                                    vehicle.trim();
                                }
                                if ((strlen(xBusStop.service[id].destination) + vehicle.length() + 3) < BUS_MAX_LOCATION) {
                                    sprintf(xBusStop.service[id].destination, "%s (%s)", xBusStop.service[id].destination, vehicle.c_str());
                                }
                            }
                            break;
                        case PBT_SCHEDULED:
                            if (line.indexOf("</td>") >= 0) {
                                if (dataColumns == 4) parseStep = PBT_EXPECTED; else {
                                    strcpy(xBusStop.service[id].expectedTime, "");
                                    parseStep = PBT_HEADER;
                                    if (serviceMatchesFilter(cleanBusFilter, xBusStop.service[id].routeNumber)) id++;
                                    if (id >= BUS_MAX_SERVICES) maxServicesRead = true;
                                }
                            } else if (line.substring(0,1) != "<") {
                                strncpy(xBusStop.service[id].sTime, line.c_str(), 5);
                            }
                            break;
                        case PBT_EXPECTED:
                            if (line.indexOf("</td>") >= 1) {
                                parseStep = PBT_HEADER;
                                if (serviceMatchesFilter(cleanBusFilter, xBusStop.service[id].routeNumber)) id++;
                                if (id >= BUS_MAX_SERVICES) maxServicesRead = true;
                            }
                            else if (line.substring(0,1) != "<") {
                                strncpy(xBusStop.service[id].expectedTime, line.c_str(), 10);
                            }
                            break;
                    }
                }
            }
            if (millis() > ticker) {
                if (callback) callback();
                ticker = millis() + 800;
            }
        }
    }

    httpsClient.stop();
    xBusStop.numServices = id;
    for (int i=0; i<xBusStop.numServices; i++) replaceWord(xBusStop.service[i].destination, "&amp;", "&");

    if (xBusStop.numServices != stationData.numServices) stationData.boardChanged = true;
    else {
        for (int i=0; i < (xBusStop.numServices < 2 ? xBusStop.numServices : 2); i++) {
            if (strcmp(xBusStop.service[i].destination, stationData.service[i].destination) || 
                strcmp(xBusStop.service[i].routeNumber, stationData.service[i].routeNumber)) {
                stationData.boardChanged = true;
                break;
            }
        }
    }

    stationData.numServices = xBusStop.numServices;
    memcpy(stationData.service, xBusStop.service, sizeof(BusService) * BUS_MAX_SERVICES);

    snprintf(lastErrorMsg, sizeof(lastErrorMsg), "SUCCESS %ums [%ld]", (uint32_t)(millis() - perfTimer), dataReceived);
    return stationData.boardChanged ? UPD_SUCCESS : UPD_NO_CHANGE;
}

String busDataSource::stripTag(String html) {
    int start = html.indexOf(">");
    int end = html.indexOf("</");
    if (start != -1 && end != -1 && end > start) {
        String res = html.substring(start+1, end);
        res.trim();
        return res;
    }
    return "";
}

void busDataSource::replaceWord(char* input, const char* target, const char* replacement) {
    char* pos = strstr(input, target);
    while (pos) {
        size_t targetLen = strlen(target);
        size_t replacementLen = strlen(replacement);
        memmove(pos + replacementLen, pos + targetLen, strlen(pos + targetLen) + 1);
        memcpy(pos, replacement, replacementLen);
        pos = strstr(pos + replacementLen, target);
    }
}

void busDataSource::trim(char* &start, char* &end) {
    while (start <= end && isspace(*start)) start++;
    while (end >= start && isspace(*end)) end--;
}

bool busDataSource::equalsIgnoreCase(const char* a, int a_len, const char* b) {
    for (int i = 0; i < a_len; i++) {
        if (tolower(a[i]) != tolower(b[i])) return false;
    }
    return b[a_len] == '\0';
}

bool busDataSource::serviceMatchesFilter(const char* filter, const char* serviceId) {
    if (!filter || filter[0] == '\0') return true;
    const char* start = filter;
    const char* ptr = filter;
    while (true) {
        if (*ptr == ',' || *ptr == '\0') {
            const char* end = ptr - 1;
            char* tS = const_cast<char*>(start);
            char* tE = const_cast<char*>(end);
            trim(tS, tE);
            int len = tE - tS + 1;
            if (len > 0 && equalsIgnoreCase(tS, len, serviceId)) return true;
            if (*ptr == '\0') break;
            start = ++ptr;
        } else ptr++;
    }
    return false;
}

void busDataSource::cleanFilter(const char* rawFilter, char* cleanedFilter, size_t maxLen) {
    if (!rawFilter || rawFilter[0] == '\0') {
        if (maxLen > 0) cleanedFilter[0] = '\0';
        return;
    }
    size_t j = 0;
    const char* ptr = rawFilter;
    while (*ptr != '\0' && j < maxLen - 1) {
        if (*ptr == ',') cleanedFilter[j++] = ',';
        else if (!isspace(*ptr)) cleanedFilter[j++] = tolower(*ptr);
        ptr++;
    }
    cleanedFilter[j] = '\0';
}

void busDataSource::whitespace(char c) {}
void busDataSource::startDocument() {}
void busDataSource::key(String key) { currentKey = key; }
void busDataSource::value(String value) { if (currentKey == "long_name") longName = value; }
void busDataSource::endArray() {}
void busDataSource::endObject() {}
void busDataSource::endDocument() {}
void busDataSource::startArray() {}
void busDataSource::startObject() {}

int busDataSource::getStopLongName(const char *locationId, char *locationName) {
    JsonStreamingParser parser;
    parser.setListener(this);
    WiFiClientSecure httpsClient;
    httpsClient.setInsecure();
    if (!httpsClient.connect(apiHost, 443)) return UPD_NO_RESPONSE;
    String request = "GET /api/stops/" + String(locationId) + " HTTP/1.0\r\nHost: " + String(apiHost) + "\r\nConnection: close\r\n\r\n";
    httpsClient.print(request);
    while (httpsClient.connected() || httpsClient.available()) {
        if (httpsClient.available()) parser.parse(httpsClient.read());
        else delay(10);
    }
    httpsClient.stop();
    strncpy(locationName, longName.c_str(), 79);
    return UPD_SUCCESS;
}
