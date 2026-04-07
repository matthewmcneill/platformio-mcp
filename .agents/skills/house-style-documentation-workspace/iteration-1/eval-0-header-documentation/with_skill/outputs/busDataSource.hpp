/*
 * Departures Board (c) 2025-2026 Gadec Software
 *
 * https://github.com/gadec-uk/departures-board
 *
 * This work is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International.
 * To view a copy of this license, visit https://creativecommons.org/licenses/by-nc-sa/4.0/
 *
 * Module: lib/boards/busBoard/busDataSource.hpp
 * Description: Bus-specific data source implementing iDataSource.
 *              Fetches and parses bus arrival information from bustimes.org.
 *
 * Exported Functions/Classes:
 * - BusService: Structure representing a single bus service arrival.
 * - BusStop: Structure holding data for a bus stop, including multiple services.
 * - busDataSourceCallback: Callback for when bus data is updated.
 * - busDataSource: Class that fetches and parses bus arrival information.
 * - busDataSource::updateData: Fetches latest bus arrival data.
 * - busDataSource::configure: Configures the data source with stop location and filters.
 * - busDataSource::getStationData: Returns the current station data.
 * - busDataSource::getStopLongName: Retrieves the long name of a bus stop.
 * - busDataSource::cleanFilter: Cleans a raw filter string.
 */

#ifndef BUS_DATA_SOURCE_HPP
#define BUS_DATA_SOURCE_HPP

#include "../interfaces/iDataSource.hpp"
#include <JsonListener.h>
#include <JsonStreamingParser.h>

#define BUS_MAX_LOCATION 45  // Maximum length of a location string
#define BUS_MAX_LINE_NAME 9   // Maximum length of a bus line name
#define BUS_MAX_SERVICES 9    // Maximum number of services to store on the board
#define BUS_MAX_FETCH 20      // Number of services to fetch from the API

/**
 * @brief Represents a single bus service arrival.
 */
struct BusService {
    char sTime[6];                      // Scheduled arrival time (HH:MM)
    char destination[BUS_MAX_LOCATION];   // Bus destination name
    char routeNumber[BUS_MAX_LOCATION];   // Bus route number/ID
    char expectedTime[11];               // Expected arrival time or status
};

/**
 * @brief Holds data for a bus stop, including multiple services.
 */
struct BusStop {
    char location[BUS_MAX_LOCATION];      // Bus stop location name
    int numServices;                   // Number of services currently loaded
    bool boardChanged;                 // Flag indicating if the board content has changed
    BusService service[BUS_MAX_SERVICES];  // Array of bus services
};

/**
 * @brief Callback for when bus data is updated.
 */
typedef void (*busDataSourceCallback) ();

/**
 * @brief Data source that fetches and parses bus arrival information.
 */
class busDataSource : public iDataSource, public JsonListener {
private:
    BusStop stationData;               // Current stop data
    char lastErrorMsg[128];            // Most recent error message

    // Internal parser state (migrated from busDataClient)
    const char* apiHost = "bustimes.org";   // API host address
    String currentKey = "";                 // Current JSON key being parsed
    String currentObject = "";              // Current JSON object being parsed
    int id = 0;                            // Internal service ID
    String longName;                        // Stop long name
    bool maxServicesRead = false;           // Flag if max services limit reached

    // HTML Scraper logic...
    /**
     * @brief Strips HTML tags from a string.
     * @param html The input HTML string.
     * @return String The string with tags removed.
     */
    String stripTag(String html);

    /**
     * @brief Replaces first occurrence of target with replacement in input.
     * @param input The buffer to modify.
     * @param target The string to find.
     * @param replacement The string to replace with.
     */
    void replaceWord(char* input, const char* target, const char* replacement);

    /**
     * @brief Trims whitespace from start and end of string.
     * @param start Pointer to start of string.
     * @param end Pointer to end of string.
     */
    void trim(char* &start, char* &end);

    /**
     * @brief Performs case-insensitive string comparison.
     * @param a First string.
     * @param a_len Length of first string.
     * @param b Second string.
     * @return true if equal.
     */
    bool equalsIgnoreCase(const char* a, int a_len, const char* b);

    /**
     * @brief Checks if a service matches the specified filter.
     * @param filter The filter string.
     * @param serviceId The service ID to check.
     * @return true if matches.
     */
    bool serviceMatchesFilter(const char* filter, const char* serviceId);

    // Configuration
    char busAtco[13];                  // ATCO code for the bus stop
    char busFilter[54];                // Raw filter string
    char cleanBusFilter[54];           // Cleaned filter string
    busDataSourceCallback callback;    // Callback after update

public:
    /**
     * @brief Constructs a new busDataSource object.
     */
    busDataSource();

    /**
     * @brief Destroys the busDataSource object.
     */
    virtual ~busDataSource() = default;

    // iDataSource implementation
    /**
     * @brief Fetches latest bus arrival data.
     * @return int Success status or error code.
     */
    int updateData() override;

    /**
     * @brief Returns the last error message.
     * @return const char* Pointer to the error message string.
     */
    const char* getLastErrorMsg() const override { return lastErrorMsg; }

    // Bus specific methods
    /**
     * @brief Configures the data source with stop location and filters.
     * @param atco ATCO code of the stop.
     * @param filter Service filter string.
     * @param cb Optional callback for data updates.
     */
    void configure(const char* atco, const char* filter, busDataSourceCallback cb = nullptr);

    /**
     * @brief Returns the current station data.
     * @return BusStop* Pointer to the station data structure.
     */
    BusStop* getStationData() { return &stationData; }

    /**
     * @brief Retrieves the long name of a bus stop.
     * @param locationId ATCO code or location ID.
     * @param locationName Buffer to store the long name.
     * @return int Success status.
     */
    int getStopLongName(const char *locationId, char *locationName);

    /**
     * @brief Cleans a raw filter string.
     * @param rawFilter The raw filter input.
     * @param cleanedFilter Buffer for the cleaned filter.
     * @param maxLen Maximum length of the buffer.
     */
    void cleanFilter(const char* rawFilter, char* cleanedFilter, size_t maxLen);

    // JsonListener implementation
    /** @brief Called on whitespace characters in JSON. */
    void whitespace(char c) override;
    /** @brief Called at start of JSON document. */
    void startDocument() override;
    /** @brief Called on JSON keys. */
    void key(String key) override;
    /** @brief Called on JSON values. */
    void value(String value) override;
    /** @brief Called at end of JSON array. */
    void endArray() override;
    /** @brief Called at end of JSON object. */
    void endObject() override;
    /** @brief Called at end of JSON document. */
    void endDocument() override;
    /** @brief Called at start of JSON array. */
    void startArray() override;
    /** @brief Called at start of JSON object. */
    void startObject() override;
};

#endif // BUS_DATA_SOURCE_HPP
