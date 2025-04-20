// ============================================================================
// RESTAURANT INTEGRATION FUNCTIONS
// This file contains the functions needed to dynamically add restaurants to
// an existing optimized itinerary.
// ============================================================================
 
// Global variable to track the currently open info window
let currentInfoWindow = null;
 
// Global variable to store the most recently selected restaurant
let selectedRestaurantDetails = null;
 
// Global variable to store polyline markers and their metadata
let polylineMarkers = [];
 
// Global variable to store which restaurants were found by which marker
let markerRestaurantMap = new Map();
 
// Global variable to store polyline segment details
let polylineSegments = [];
 
// Function to add a restaurant to the current route
function addOnRoute(restaurantName, locationLat, locationLng, markerId, polylineId) {
    // Create a LatLng object from the coordinates
    const restaurantLocation = new google.maps.LatLng(parseFloat(locationLat), parseFloat(locationLng));
 
    // Close the info window
    if (currentInfoWindow) {
        currentInfoWindow.close();
    }
 
    // Add restaurant to route with marker and polyline info
    addRestaurantToRoute(restaurantName, restaurantLocation, markerId, polylineId);
}
 
// Main function to add a restaurant to the current route
function addRestaurantToRoute(restaurantName, restaurantLocation, markerId, polylineId) {
    // Show loading overlay
    showLoadingOverlay("Updating your itinerary...");
 
    // Get the polyline segment details
    const polylineSegment = polylineSegments.find(segment => segment.id === polylineId) || {};
    const fromPlace = polylineSegment.fromPlace || null;
    const toPlace = polylineSegment.toPlace || null;
    const mealType = polylineSegment.mealType || null;
 
    // Find the optimal place to insert the restaurant in the current route
    findOptimalRestaurantPlacement(restaurantName, restaurantLocation, mealType, fromPlace, toPlace, markerId, polylineId)
        .then(placement => {
            // Send the placement data to Python backend for route recalculation
            return updateRouteWithRestaurant(placement);
        })
        .then(updatedRoute => {
            // Refresh the map with the new route
            refreshMapWithUpdatedRoute(updatedRoute);
            hideLoadingOverlay();
 
            // Show success message
            showNotification("Restaurant added successfully to your itinerary!");
 
            // Reset selected restaurant details
            selectedRestaurantDetails = null;
        })
        .catch(error => {
            hideLoadingOverlay();
            showNotification("Couldn't add restaurant: " + error.message, "error");
            console.error("Error adding restaurant:", error);
           
            // Reset selected restaurant details
            selectedRestaurantDetails = null;
        });
}
 
// Function to find the optimal placement for the restaurant in the route
async function findOptimalRestaurantPlacement(restaurantName, restaurantLocation, mealType = null, fromPlace = null, toPlace = null, markerId = null, polylineId = null) {
    return new Promise((resolve, reject) => {
        try {
            // Create a DirectionsService instance for route calculations
            const directionsService = new google.maps.DirectionsService();
 
            // Get current route details
            const currentRoute = bestRouteList;
            const arrivalTimes = arrivalTimesList;
            const departureTimes = departureTimesList;
 
            // Store the best insertion details
            let bestInsertion = {
                beforeIndex: null,
                afterIndex: null,
                travelTimeToRestaurant: Infinity,
                travelTimeFromRestaurant: Infinity,
                totalAdditionalTime: Infinity,
                arrivalTimeAtRestaurant: null,
                departureTimeFromRestaurant: null,
                mealType: null
            };
           
            // Track best insertion meal window quality (without modifying bestInsertion object)
            let bestInsertionIsFullMatch = false;
 
            // Track promises for all placement calculations
            const placementPromises = [];
 
            // If fromPlace and toPlace are provided (from a specific polyline segment),
            // prioritize this segment for insertion
            let prioritySegment = null;
            if (fromPlace && toPlace) {
                // Find the index of fromPlace and toPlace in the route
                const fromIndex = currentRoute.findIndex(place => place === fromPlace);
                const toIndex = currentRoute.findIndex(place => place === toPlace);
               
                // If both places are found and they are adjacent in the route
                if (fromIndex >= 0 && toIndex >= 0 && toIndex === fromIndex + 1) {
                    prioritySegment = {
                        fromIndex,
                        toIndex,
                        fromPlace,
                        toPlace
                    };
                    console.log(`Priority segment identified: ${fromPlace} to ${toPlace}`);
                }
            }
 
            // For each segment of the route (between adjacent places)
            for (let i = 0; i < currentRoute.length - 1; i++) {
                const beforePlace = currentRoute[i];
                const afterPlace = currentRoute[i + 1];
 
                // Skip if this is a return to hotel leg and not the first leg
                if (i > 0 && (i === currentRoute.length - 2) &&
                    (currentRoute[i] !== currentRoute[0] && currentRoute[i + 1] === currentRoute[0])) {
                    continue;
                }
 
                // Calculate travel time to restaurant from the 'before' place
                const promiseToRestaurant = new Promise((resolvePromise) => {
                    directionsService.route({
                        origin: beforePlace,
                        destination: restaurantLocation,
                        travelMode: google.maps.TravelMode.DRIVING
                    }, (result, status) => {
                        if (status === google.maps.DirectionsStatus.OK) {
                            return resolvePromise({
                                result,
                                travelTime: result.routes[0].legs[0].duration.value / 60  // Convert to minutes
                            });
                        } else {
                            console.warn(`Failed to get directions from ${beforePlace} to restaurant: ${status}`);
                            resolvePromise({ result: null, travelTime: 30 }); // Default fallback
                        }
                    });
                });
 
                // Calculate travel time from restaurant to the 'after' place
                const promiseFromRestaurant = new Promise((resolvePromise) => {
                    directionsService.route({
                        origin: restaurantLocation,
                        destination: afterPlace,
                        travelMode: google.maps.TravelMode.DRIVING
                    }, (result, status) => {
                        if (status === google.maps.DirectionsStatus.OK) {
                            return resolvePromise({
                                result,
                                travelTime: result.routes[0].legs[0].duration.value / 60  // Convert to minutes
                            });
                        } else {
                            console.warn(`Failed to get directions from restaurant to ${afterPlace}: ${status}`);
                            resolvePromise({ result: null, travelTime: 30 }); // Default fallback
                        }
                    });
                });
 
                // Calculate original direct travel time between the two places
                const promiseDirectRoute = new Promise((resolvePromise) => {
                    directionsService.route({
                        origin: beforePlace,
                        destination: afterPlace,
                        travelMode: google.maps.TravelMode.DRIVING
                    }, (result, status) => {
                        if (status === google.maps.DirectionsStatus.OK) {
                            return resolvePromise({
                                result,
                                travelTime: result.routes[0].legs[0].duration.value / 60  // Convert to minutes
                            });
                        } else {
                            console.warn(`Failed to get directions from ${beforePlace} to ${afterPlace}: ${status}`);
                            resolvePromise({ result: null, travelTime: 30 }); // Default fallback
                        }
                    });
                });
 
                // Process all three route calculations together
                const segmentPromise = Promise.all([promiseToRestaurant, promiseFromRestaurant, promiseDirectRoute])
                    .then(([toRestaurant, fromRestaurant, directRoute]) => {
                        // Calculate additional travel time incurred by adding restaurant
                        const additionalTravelTime =
                            toRestaurant.travelTime + fromRestaurant.travelTime - directRoute.travelTime;
 
                        // Calculate total additional time (travel + restaurant visit)
                        const restaurantVisitDuration = 60; // Default time spent at restaurant (in minutes)
                        const totalAdditionalTime = additionalTravelTime + restaurantVisitDuration;
 
                        // Calculate arrival time at restaurant
                        let arrivalTimeAtRestaurant;
                        if (i === 0) {
                            // If inserting after start point (hotel)
                            arrivalTimeAtRestaurant = departureTimes[i] + toRestaurant.travelTime;
                        } else {
                            // For other insertions
                            arrivalTimeAtRestaurant = departureTimes[i] + toRestaurant.travelTime;
                        }
 
                        // Calculate departure time from restaurant
                        const departureTimeFromRestaurant = arrivalTimeAtRestaurant + restaurantVisitDuration;
                       
                        // Check meal windows more specifically, focusing only on the suggested meal type
                        let validMealWindows = [];
                       
                        // If we have a suggestedMealType from the polyline segment, only check that meal type
                        // This is the key change to only use the suggested meal type
                        const suggestedMealType = mealType;
                       
                        if (suggestedMealType && mealTimes[suggestedMealType]) {
                            const [start, end] = mealTimes[suggestedMealType];
                            // Check if any part of the restaurant visit overlaps with the suggested meal window
                            if (!(departureTimeFromRestaurant <= start || arrivalTimeAtRestaurant >= end)) {
                                // Calculate the overlap duration
                                const overlapStart = Math.max(arrivalTimeAtRestaurant, start);
                                const overlapEnd = Math.min(departureTimeFromRestaurant, end);
                                const overlapDuration = overlapEnd - overlapStart;
                                const isFullMatch = (arrivalTimeAtRestaurant >= start && departureTimeFromRestaurant <= end);
                               
                                validMealWindows.push({
                                    type: suggestedMealType,
                                    timeMatch: overlapDuration,
                                    isFullMatch: isFullMatch
                                });
                            }
                        } else {
                            console.log("No suggested meal type found, skipping this segment");
                            // If no specific meal type was suggested, skip this segment
                            return;
                        }
                       
                        // Sort valid meal windows by preference:
                        // 1. Prefer full matches (both arrival and departure within window)
                        // 2. Then prefer windows with longer time match
                        validMealWindows.sort((a, b) => {
                            // First sort by full match (true comes before false)
                            if (a.isFullMatch !== b.isFullMatch) return b.isFullMatch ? 1 : -1;
                            // Then sort by time match (higher comes first)
                            return b.timeMatch - a.timeMatch;
                        });
                       
                        // Check if this is the priority segment (from the polyline that found the restaurant)
                        const isPrioritySegment = prioritySegment &&
                                                i === prioritySegment.fromIndex &&
                                                i + 1 === prioritySegment.toIndex;
                       
                        // Apply a priority bonus if this is the segment identified by the marker
                        let priorityBonus = isPrioritySegment ? 0.5 : 0;
                       
                        // If we have any valid meal windows, check if this placement is better than current best
                        if (validMealWindows.length > 0) {
                            const bestMealWindow = validMealWindows[0];
                           
                            // Decide if this insertion is better than our current best
                            const isBetterInsertion =
                                // If we don't have a best insertion yet, this is better
                                bestInsertion.beforeIndex === null ||
                                // If this is a priority segment and the current best is not
                                (isPrioritySegment && (bestInsertion.beforeIndex !== prioritySegment.fromIndex ||
                                                      bestInsertion.afterIndex !== prioritySegment.toIndex)) ||
                                // If current best is not a full match but this one is, this is better
                                (!bestInsertionIsFullMatch && bestMealWindow.isFullMatch) ||
                                // If both are full matches or both are partial, compare additional time (with priority bonus)
                                ((bestInsertionIsFullMatch === bestMealWindow.isFullMatch) &&
                                 (totalAdditionalTime * (1 - priorityBonus)) < bestInsertion.totalAdditionalTime);
                           
                            if (isBetterInsertion) {
                                bestInsertion = {
                                    beforeIndex: i,
                                    afterIndex: i + 1,
                                    beforePlace: beforePlace,
                                    afterPlace: afterPlace,
                                    travelTimeToRestaurant: toRestaurant.travelTime,
                                    travelTimeFromRestaurant: fromRestaurant.travelTime,
                                    totalAdditionalTime: totalAdditionalTime,
                                    arrivalTimeAtRestaurant: arrivalTimeAtRestaurant,
                                    departureTimeFromRestaurant: departureTimeFromRestaurant,
                                    routeToRestaurant: toRestaurant.result,
                                    routeFromRestaurant: fromRestaurant.result,
                                    mealType: bestMealWindow.type,
                                    isPrioritySegment: isPrioritySegment,
                                    markerId: markerId,
                                    polylineId: polylineId
                                };
                               
                                // Update our tracking variable
                                bestInsertionIsFullMatch = bestMealWindow.isFullMatch;
                            }
                        }
                    });
 
                placementPromises.push(segmentPromise);
            }
 
            // Once all placement calculations are done
            Promise.all(placementPromises).then(() => {
                // Ensure we found at least one valid insertion point
                if (bestInsertion.beforeIndex === null) {
                    reject(new Error(`Could not find a suitable place in the itinerary to add this restaurant within the suggested ${mealType} time window.`));
                    return;
                }
                console.log("Restaurant Details are : ", selectedRestaurantDetails);
               
                // Format arrival and departure times for display
                const formatTime = (minutes) => {
                    const hours = Math.floor(minutes / 60);
                    const mins = Math.floor(minutes % 60);
                    const ampm = hours >= 12 ? 'PM' : 'AM';
                    const displayHours = hours % 12 === 0 ? 12 : hours % 12;
                    return `${displayHours}:${mins < 10 ? '0' + mins : mins} ${ampm}`;
                };
               
                // Prepare the placement data
                const placement = {
                    restaurant: {
                        name: restaurantName,
                        location: restaurantLocation,
                        details: selectedRestaurantDetails // Include full restaurant details
                    },
                    beforeIndex: bestInsertion.beforeIndex,
                    afterIndex: bestInsertion.afterIndex,
                    beforePlace: bestInsertion.beforePlace,
                    afterPlace: bestInsertion.afterPlace,
                    travelTimeToRestaurant: bestInsertion.travelTimeToRestaurant,
                    travelTimeFromRestaurant: bestInsertion.travelTimeFromRestaurant,
                    arrivalTimeAtRestaurant: bestInsertion.arrivalTimeAtRestaurant,
                    formattedArrivalTime: formatTime(bestInsertion.arrivalTimeAtRestaurant),
                    departureTimeFromRestaurant: bestInsertion.departureTimeFromRestaurant,
                    formattedDepartureTime: formatTime(bestInsertion.departureTimeFromRestaurant),
                    totalAdditionalTime: bestInsertion.totalAdditionalTime,
                    routeToRestaurant: bestInsertion.routeToRestaurant,
                    routeFromRestaurant: bestInsertion.routeFromRestaurant,
                    mealType: bestInsertion.mealType,
                    markerId: bestInsertion.markerId,
                    polylineId: bestInsertion.polylineId
                };
 
                resolve(placement);
            });
 
        } catch (error) {
            reject(error);
        }
    });
}
 
// Function to find restaurants along route with enhanced polyline tracking
function findRestaurantsAlongRoute(map, result) {
    // Clear any existing restaurant markers
    clearRestaurantMarkers();
   
    // Clear polyline markers and segment data
    polylineMarkers = [];
    polylineSegments = [];
    markerRestaurantMap.clear();
 
    // Create a Places service
    const placesService = new google.maps.places.PlacesService(map);
 
    // Search for restaurants along each meal-specific route
    searchMealRestaurants(placesService, map);
 
    // Add toggle button to control
    addRestaurantToggleButton(map);
    addFilterPanelToggleButton(map);
}
 
function searchMealRestaurants(placesService, map) {
    if (!routePolylines) {
        console.error("Route polylines not available");
        return;
    }
 
    // Search along each meal-specific route
    for (const [mealType, polyline] of Object.entries(routePolylines)) {
        if (polyline && polyline.length > 0) {
            searchAlongRouteMealSpecific(placesService, map, polyline, mealType);
        }
    }
}
 
function searchAlongRouteMealSpecific(placesService, map, routePolyline, mealType) {
    // First, decode the entire polyline
    let decodedPath = [];
    console.log("routePolyline:", routePolyline);
 
    // Check if routePolyline is an array of encoded strings
    if (Array.isArray(routePolyline) && typeof routePolyline[0] === 'string') {
        // If it's an array of encoded strings, decode and combine them
        for (const segment of routePolyline) {
            const points = google.maps.geometry.encoding.decodePath(segment);
            decodedPath = decodedPath.concat(points);
        }
    } else {
        console.error("Unexpected route polyline format");
        return;
    }
 
    // If we have no points, exit
    if (decodedPath.length === 0) {
        console.log(`No points to search for ${mealType} restaurants`);
        return;
    }
 
    // Now sample points along the decoded path (fewer points for shorter routes)
    const numPoints = Math.min(5, Math.max(1, Math.floor(decodedPath.length / 100)));
    const pathLength = decodedPath.length;
   
    console.log(`Decoded path length for ${mealType}:`, pathLength, "using", numPoints, "search points");
   
    // Find the route segment (from/to places) that this polyline belongs to
    const routeSegment = findPolylineRouteSegment(routePolyline, mealType);
   
    for (let i = 0; i < numPoints; i++) {
        // Calculate a position from 0 to 1 along the route
        const position = i / (numPoints - 1 || 1);  // Avoid division by zero
       
        // Get the corresponding index in the decoded path
        const index = Math.floor(position * (pathLength - 1));
       
        // Get the LatLng point at this index
        const searchPoint = decodedPath[index];
       
        // Create a unique ID for this marker position
        const markerId = `marker-${mealType}-${i}`;
       
        // Create a unique ID for this polyline
        const polylineId = `polyline-${mealType}-${routePolyline[0].substring(0, 8)}`;
       
        // Store polyline segment details
        if (routeSegment) {
            polylineSegments.push({
                id: polylineId,
                fromPlace: routeSegment.fromPlace,
                toPlace: routeSegment.toPlace,
                mealType: mealType,
                departureTime: routeSegment.departureTime,
                arrivalTime: routeSegment.arrivalTime
            });
        }
       
        // Create an invisible marker at this search point
        const marker = new google.maps.Marker({
            position: searchPoint,
            map: map,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 1,
                fillOpacity: 0,
                strokeOpacity: 0
            },
            visible: false,
            id: markerId,
            polylineId: polylineId,
            mealType: mealType
        });
       
        polylineMarkers.push(marker);
       
        console.log(`Searching for ${mealType} at path index:`, index);
       
        // Stagger requests to avoid hitting API rate limits
        setTimeout(() => {
            performTextSearch(placesService, map, searchPoint, mealType, markerId, polylineId);
        }, i * 300);
    }
}
 
// Helper function to find which route segment a polyline belongs to
function findPolylineRouteSegment(polyline, mealType) {
    // Get the current route and timing information
    const route = bestRouteList;
    const departureTimes = departureTimesList;
    const arrivalTimes = arrivalTimesList;
   
    // If we don't have route data, return null
    if (!route || route.length < 2) {
        return null;
    }
   
    // Create a sample point from the polyline to test route matches
    const samplePoint = google.maps.geometry.encoding.decodePath(polyline[0])[0];
   
    // Find which route segment this polyline likely belongs to
    for (let i = 0; i < route.length - 1; i++) {
        const fromPlace = route[i];
        const toPlace = route[i + 1];
       
        // Get the departure time from the first place and arrival time at the second place
        const departureTime = departureTimes[i];
        const arrivalTime = arrivalTimes[i + 1];
       
        // Check if this route segment is active during this meal type's time window
        let inMealWindow = false;
        if (mealTimes[mealType]) {
            const [start, end] = mealTimes[mealType];
            // Check if any part of the travel overlaps with the meal window
            inMealWindow = !(arrivalTime <= start || departureTime >= end);
        }
       
        // If this segment is active during the meal window, it's likely our segment
        if (inMealWindow) {
            return {
                fromPlace,
                toPlace,
                departureTime,
                arrivalTime
            };
        }
    }
   
    // If we couldn't determine the segment, return the first segment as a fallback
    return {
        fromPlace: route[0],
        toPlace: route[1],
        departureTime: departureTimes[0],
        arrivalTime: arrivalTimes[1]
    };
}
 
function performTextSearch(placesService, map, location, mealType, markerId, polylineId) {
    // Base query by meal type
    let query = 'restaurant';
   
    // Add meal-specific keyword
    if (mealType === 'breakfast') {
        query = 'breakfast';
    } else if (mealType === 'lunch') {
        query = 'lunch';
    } else if (mealType === 'dinner') {
        query = 'dinner';
    }
 
    // Add cuisines to query if selected
    if (filterSettings.cuisines.length > 0) {
        query += ' ' + filterSettings.cuisines.join(' ');
    }
 
    // Add vegetarian to query if selected
    if (filterSettings.vegetarianOnly) {
        query += ' vegetarian';
    }
 
    // Add user keyword if provided
    if (filterSettings.keyword && filterSettings.keyword.trim() !== '') {
        query += ' ' + filterSettings.keyword.trim();
    }
 
    console.log(`Searching for: "${query}" at meal time: ${mealType} with marker ${markerId} on polyline ${polylineId}`);
 
    // Use the location directly - it should be a LatLng object
    const request = {
        location: location,
        radius: 300,  // Search within 300 meters of the polyline point
        query: query,
        type: 'restaurant',
        minprice: convertRupeesToPriceLevel(filterSettings.priceRange.min),
        maxprice: convertRupeesToPriceLevel(filterSettings.priceRange.max)
    };
 
    // Perform text search
    placesService.textSearch(request, (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK) {
            // Process results (limit to 4 per search area)
            const maxToShow = Math.min(results.length, 6);
 
            for (let i = 0; i < maxToShow; i++) {
                const place = results[i];
               
                // Add meal type to the place object for reference
                place.mealType = mealType;
               
                // Add marker and polyline ID to the place object
                place.markerId = markerId;
                place.polylineId = polylineId;
               
                // Store which marker recommended this restaurant
                if (!markerRestaurantMap.has(markerId)) {
                    markerRestaurantMap.set(markerId, []);
                }
                markerRestaurantMap.get(markerId).push(place.place_id);
 
                // Get detailed place information
                getPlaceDetails(placesService, map, place);
            }
        } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
            console.log(`No results found for ${mealType} query: ${query}`);
        } else {
            console.warn(`${mealType} restaurant search failed with status: ${status}`);
        }
    });
}
 
// Function to send the restaurant placement data to Python backend for route recalculation
async function updateRouteWithRestaurant(placement) {
    return new Promise((resolve, reject) => {
        try {
            // Create payload for backend
            const payload = {
                route: bestRouteList,
                arrivalTimes: arrivalTimesList,
                departureTimes: departureTimesList,
                waitTimes: waitTimesList,
                restaurant: {
                    name: placement.restaurant.name,
                    beforeIndex: placement.beforeIndex,
                    afterIndex: placement.afterIndex,
                    arrivalTime: placement.arrivalTimeAtRestaurant,
                    departureTime: placement.departureTimeFromRestaurant,
                    travelTimeTo: placement.travelTimeToRestaurant,
                    travelTimeFrom: placement.travelTimeFromRestaurant,
                    totalAdditionalTime: placement.totalAdditionalTime,
                    details: placement.restaurant.details || null,
                    markerId: placement.markerId,
                    polylineId: placement.polylineId,
                    mealType: placement.mealType
                }
            };
 
            // Send data to backend API
            fetch('/update_route_with_restaurant', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            })
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Failed to update route with restaurant');
                    }
                    console.log("It responded with : ", response);
                    return response.json();
                })
                .then(data => {
                    // Store updated route data globally
                    bestRouteList = data.route;
                    arrivalTimesList = data.arrival_times;
                    departureTimesList = data.departure_times;
                    waitTimesList = data.wait_times;
 
                    resolve(data);
                })
                .catch(error => {
                    console.error("API error details:", error);
                    // Create a simple fallback response
                    const fallbackResponse = {
                        route: bestRouteList,
                        arrival_times: arrivalTimesList,
                        departure_times: departureTimesList,
                        wait_times: waitTimesList,
                        itinerary: ["⚠️ Could not update route with restaurant due to an error.",
                            "Please try a different restaurant or refresh the page."],
                        warning: true
                    };
 
                    // Show error notification but continue
                    showNotification("Error adding restaurant: " + error.message, "error");
 
                    // Resolve with fallback to avoid cascading errors
                    resolve(fallbackResponse);
                });
        } catch (error) {
            reject(error);
        }
    });
}
 
// Function to refresh map with updated route
function refreshMapWithUpdatedRoute(updatedRoute) {
    // Check if there's a warning to display
    if (updatedRoute.warning) {
        if (updatedRoute.removed_places && updatedRoute.removed_places.length > 0) {
            // Places were removed to keep within time constraints
            showNotification(
                `To add the restaurant within your time constraints, these places were removed: ${updatedRoute.removed_places.join(", ")}`,
                "warning"
            );
        } else if (updatedRoute.extended_end_time) {
            // Trip time was extended
            const extendedTime = formatTime(updatedRoute.extended_end_time);
            showNotification(
                `Adding this restaurant extends your trip end time to ${extendedTime}`,
                "warning"
            );
        }
    }
 
    // Reset the map
    const mapElement = document.getElementById('map');
    if (mapElement) {
        // Clear existing route visualization by reinitializing the map
        initMap();
    }
 
    // Update itinerary display
    updateItineraryDisplay(updatedRoute.itinerary);
}
 
// Helper function to update the itinerary display
function updateItineraryDisplay(itinerary) {
    const itineraryContainer = document.getElementById('leftPart');
    if (itineraryContainer) {
        // Convert itinerary array to HTML
        const itineraryHTML = itinerary.map(item => `<p>${item}</p>`).join('');
        itineraryContainer.innerHTML = itineraryHTML;
    }
}
 
// Helper function to format time (minutes from midnight to 12-hour time)
function formatTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const period = hours >= 12 ? "PM" : "AM";
    const display_hours = hours % 12 || 12; // Convert 0 to 12 for 12 AM
    return `${display_hours}:${mins.toString().padStart(2, '0')} ${period}`;
}
 
// Function to show loading overlay
function showLoadingOverlay(message) {
    // Create overlay element if it doesn't exist
    let overlay = document.getElementById('loading-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = 0;
        overlay.style.left = 0;
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        overlay.style.zIndex = 9999;
        overlay.style.display = 'flex';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.flexDirection = 'column';
        document.body.appendChild(overlay);
    }
 
    // Set message
    overlay.innerHTML = `
        <div style="background-color: white; padding: 20px; border-radius: 5px; text-align: center;">
            <div class="spinner" style="border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 30px; height: 30px; animation: spin 2s linear infinite; margin: 0 auto;"></div><p style="margin-top: 10px;">${message || 'Loading...'}</p>
        </div>
    `;
 
    // Add animation keyframes if not already added
    if (!document.getElementById('loading-overlay-styles')) {
        const style = document.createElement('style');
        style.id = 'loading-overlay-styles';
        style.innerHTML = `
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }
 
    // Show overlay
    overlay.style.display = 'flex';
}
 
// Function to hide loading overlay
function hideLoadingOverlay() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}
 
// Function to show notification
function showNotification(message, type = 'success') {
    // Create notification element if it doesn't exist
    let notification = document.getElementById('notification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'notification';
        notification.style.position = 'fixed';
        notification.style.bottom = '20px';
        notification.style.right = '20px';
        notification.style.padding = '15px 20px';
        notification.style.borderRadius = '5px';
        notification.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
        notification.style.zIndex = 9999;
        notification.style.transition = 'all 0.3s ease';
        document.body.appendChild(notification);
    }
 
    // Set style based on notification type
    if (type === 'success') {
        notification.style.backgroundColor = '#4CAF50';
        notification.style.color = 'white';
    } else if (type === 'error') {
        notification.style.backgroundColor = '#F44336';
        notification.style.color = 'white';
    } else if (type === 'warning') {
        notification.style.backgroundColor = '#FFC107';
        notification.style.color = 'black';
    } else {
        notification.style.backgroundColor = '#2196F3';
        notification.style.color = 'white';
    }
 
    // Set message
    notification.innerHTML = message;
 
    // Show notification
    notification.style.display = 'block';
 
    // Hide after 5 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
            notification.style.display = 'none';
            notification.style.opacity = '1';
        }, 300);
    }, 5000);
}
 
// Update the addRestaurantMarker function to support adding restaurants to route
// This overrides the addRestaurantMarker function from your original code
let originalAddRestaurantMarker = addRestaurantMarker; // Store original function if it exists
 
// New implementation that adds the "Add to Route" button and tracks polyline information
addRestaurantMarker = function (map, place) {
    // Skip if this place is too far from any of our polyline search points
    let closestMarker = null;
    let closestDistance = Infinity;
    let polylineId = null;
   
    // Find the closest polyline marker to this restaurant
    for (const marker of polylineMarkers) {
        const distance = google.maps.geometry.spherical.computeDistanceBetween(
            place.geometry.location,
            marker.getPosition()
        );
       
        // Only consider markers within 300 meters
        if (distance < 750 && distance < closestDistance) {
            closestDistance = distance;
            closestMarker = marker;
            polylineId = marker.polylineId;
        }
    }
   
    // Skip this restaurant if it's not close enough to any polyline
    if (!closestMarker) {
        console.log(`Restaurant ${place.name} is too far from the route, skipping.`);
        return null;
    }
   
    // Store the marker ID that found this restaurant
    const markerId = closestMarker.id;
    place.markerId = markerId;
    place.polylineId = polylineId;
    place.closestDistance = closestDistance;
   
    console.log(`Restaurant ${place.name} is ${closestDistance.toFixed(0)}m from marker ${markerId} on polyline ${polylineId}`);
   
    // Create a marker for the restaurant
    const marker = new google.maps.Marker({
        position: place.geometry.location,
        map: map,
        title: place.name,
        icon: {
            url: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png',
            scaledSize: new google.maps.Size(32, 32)
        },
        visible: showingRestaurants, // Respect current visibility setting
        markerId: markerId,
        polylineId: polylineId
    });
 
    // Get location coordinates
    const lat = place.geometry.location.lat();
    const lng = place.geometry.location.lng();
 
    // Get the polyline segment details
    const segment = polylineSegments.find(s => s.id === polylineId) || {};
    const segmentInfo = segment.fromPlace && segment.toPlace ?
        `<p style="margin-top: 3px; font-size: 12px; color: #666;">Between: ${segment.fromPlace} and ${segment.toPlace}</p>` : '';
   
    // Find suggested meal type based on polyline info
    const suggestedMealType = segment.mealType || place.mealType || 'meal';
    const mealTypeInfo = `<p style="margin-top: 3px; font-size: 12px; color: #666;">Suggested for: ${suggestedMealType}</p>`;
 
    // Create an info window with restaurant details
    const infoWindow = new google.maps.InfoWindow({
        content: `
      <div style="max-width: 300px">
        <h3 style="margin-top: 5px; margin-bottom: 5px;">${place.name}</h3>
        <p style="margin-top: 5px; margin-bottom: 5px;">Rating: ${place.rating ? place.rating.toFixed(1) + '/5' : 'N/A'}
          ${place.user_ratings_total ? `(${place.user_ratings_total} reviews)` : ''}</p>
        <p style="margin-top: 5px; margin-bottom: 5px;">${place.vicinity || place.formatted_address || ''}</p>
        ${place.price_level ? `<p style="margin-top: 3px; margin-bottom: 3px;">Price Level: ${getPrice(place.price_level)}</p>` : ''}
        ${segmentInfo}
        ${mealTypeInfo}
        ${place.photos && place.photos.length > 0 ?
            `<img src="${place.photos[0].getUrl({ maxWidth: 200, maxHeight: 200 })}" alt="${place.name}" style="width:100%; max-width:200px; margin-top: 5px;">` : ''}
        <button onclick="selectRestaurantForRoute('${place.name.replace(/'/g, "\\'")}', ${lat}, ${lng}, ${JSON.stringify(place).replace(/"/g, "&quot;")}, '${markerId}', '${polylineId}')"
            style="margin-top: 10px; padding: 8px 12px; background-color: #1a73e8; color: white; border: none; border-radius: 5px; cursor: pointer; width: 100%;">
            Add to Current Route
        </button>
      </div>
    `
    });
 
    // Add click listener to open info window
    marker.addListener('click', () => {
        // Close current info window if open
        if (currentInfoWindow) {
            currentInfoWindow.close();
        }
 
        // Open new info window and store reference
        infoWindow.open(map, marker);
        currentInfoWindow = infoWindow;
    });
 
    return marker;
};
 
// New function to capture and store restaurant details before adding to route
function selectRestaurantForRoute(restaurantName, lat, lng, placeDetails, markerId, polylineId) {
    // Store the full restaurant details globally
    const vicinity = placeDetails.vicinity;
    restaurantName = restaurantName + " " + vicinity + " " + city;
    console.log("Restaurant to add:", restaurantName);
    console.log("Place details:", placeDetails);
    console.log("Marker ID:", markerId, "Polyline ID:", polylineId);
   
    // Find the segment this restaurant belongs to
    const segment = polylineSegments.find(s => s.id === polylineId);
    if (segment) {
        console.log("Segment details:", segment);
    }
   
    selectedRestaurantDetails = {
        name: restaurantName,
        lat: lat,
        lng: lng,
        details: placeDetails,
        markerId: markerId,
        polylineId: polylineId
    };
 
    // Call the existing function to add the restaurant
    addOnRoute(restaurantName, lat, lng, markerId, polylineId);
}
 