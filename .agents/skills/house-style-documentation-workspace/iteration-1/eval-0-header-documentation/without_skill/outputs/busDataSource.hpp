/*
 * Departures Board (c) 2025-2026 Gadec Software
 *
 * https://github.com/gadec-uk/departures-board
 *
 * Module: lib/boards/busBoard/busDataSource.hpp
 * Description: Bus-specific data source.
 */

#ifndef BUS_DATA_SOURCE_HPP
#define BUS_DATA_SOURCE_HPP

#include "../interfaces/iDataSource.hpp"
#include <JsonListener.h>
#include <JsonStreamingParser.h>

#define BUS_MAX_LOCATION 45 
#define BUS_MAX_LINE_NAME 9 
#define BUS_MAX_SERVICES 9  
#define BUS_MAX_FETCH 20    

struct BusService {
    char sTime[6];
    char destination[BUS_MAX_LOCATION];
    char routeNumber[BUS_MAX_LOCATION]; 
    char expectedTime[11];
};

struct BusStop {
    char location[BUS_MAX_LOCATION];
    int numServices;
    bool boardChanged;
    BusService service[BUS_MAX_SERVICES];
};

typedef void (*busDataSourceCallback) ();

class busDataSource : public iDataSource, public JsonListener {
private:
    BusStop stationData;
    char lastErrorMsg[128];
    
    // Internal parser state
    const char* apiHost = "bustimes.org";
    String currentKey = "";
    String currentObject = "";
    int id = 0;
    String longName;
    bool maxServicesRead = false;
    
    String stripTag(String html);
    void replaceWord(char* input, const char* target, const char* replacement);
    void trim(char* &start, char* &end);
    bool equalsIgnoreCase(const char* a, int a_len, const char* b);
    bool serviceMatchesFilter(const char* filter, const char* serviceId);

    char busAtco[13];
    char busFilter[54];
    char cleanBusFilter[54];
    busDataSourceCallback callback;

public:
    busDataSource();
    virtual ~busDataSource() = default;

    int updateData() override;
    const char* getLastErrorMsg() const override { return lastErrorMsg; }

    void configure(const char* atco, const char* filter, busDataSourceCallback cb = nullptr);
    BusStop* getStationData() { return &stationData; }
    int getStopLongName(const char *locationId, char *locationName);
    void cleanFilter(const char* rawFilter, char* cleanedFilter, size_t maxLen);

    void whitespace(char c) override;
    void startDocument() override;
    void key(String key) override;
    void value(String value) override;
    void endArray() override;
    void endObject() override;
    void endDocument() override;
    void startArray() override;
    void startObject() override;
};

#endif // BUS_DATA_SOURCE_HPP
