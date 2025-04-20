// searches restaurants based on the time window the route polyline falls into
let mealTimes = {
    breakfast: [6 * 60, 10 * 60],   // 6:00 AM - 10:00 AM
    lunch: [12 * 60, 15 * 60],      // 12:00 PM - 3:00 PM
    dinner: [19.5 * 60, 22.5 * 60]      // 6:00 PM - 10:00 PM
};
let restaurantMarkers = [];
let showingRestaurants = false;
let filterSettings = {
    cuisines: [],
    vegetarianOnly: false,
    keyword: '', // Added keyword for text search
    priceRange: {
        min: 0,    // Min price in rupees
        max: 2000  // Max price in rupees
    }
};

// Store route polyline for reuse
let routePolylines = {};

// function initMap() {
//     var directionsService = new google.maps.DirectionsService();
//     var geocoder = new google.maps.Geocoder();

//     if (!bestRouteList || bestRouteList.length === 0) {
//         alert("No route data available!");
//         return;
//     }

//     var waypoints = bestRouteList.slice(1, -1).map(place => ({ location: place, stopover: true }));

//     geocoder.geocode({ address: city }, function (results, status) {
//         if (status === "OK") {
//             var map = new google.maps.Map(document.getElementById('map'), {
//                 zoom: 11.75,
//                 center: results[0].geometry.location
//             });

//             var trafficLayer = new google.maps.TrafficLayer();
//             trafficLayer.setMap(map);

//             var request = {
//                 origin: bestRouteList[0],
//                 destination: bestRouteList[bestRouteList.length - 1],
//                 waypoints: waypoints,
//                 travelMode: google.maps.TravelMode.DRIVING,
//                 drivingOptions: {
//                     departureTime: new Date(),
//                     trafficModel: "bestguess"
//                 }
//             };

//             directionsService.route(request, function (result, status) {
//                 if (status === google.maps.DirectionsStatus.OK) {
//                     drawTrafficRoutes(map, result);
//                     addMarkers(map, bestRouteList, arrivalTimesList, waitTimesList);
//                     console.log(result)
//                     // Store the polyline representation of the route
//                     extractRoutePolyline(result);

//                     // Add restaurant controls
//                     addRestaurantFilterPanel(map);

//                     // Search for restaurants
//                     findRestaurantsAlongRoute(map, result);
//                 } else {
//                     alert("Could not display route. Error: " + status);
//                 }
//             });

//         } else {
//             alert("Could not find city location: " + status);
//         }
//     });
// }

function initMap() {
    var directionsService = new google.maps.DirectionsService();
    var geocoder = new google.maps.Geocoder();

    if (!bestRouteList || bestRouteList.length === 0) {
        alert("No route data available!");
        return;
    }

    var waypoints = bestRouteList.slice(1, -1).map(place => ({ location: place, stopover: true }));

    geocoder.geocode({ address: city }, function (results, status) {
        if (status === "OK") {
            var map = new google.maps.Map(document.getElementById('map'), {
                zoom: 11.75,
                center: results[0].geometry.location
            });

            var trafficLayer = new google.maps.TrafficLayer();
            trafficLayer.setMap(map);

            var request = {
                origin: bestRouteList[0],
                destination: bestRouteList[bestRouteList.length - 1],
                waypoints: waypoints,
                travelMode: google.maps.TravelMode.DRIVING,
                drivingOptions: {
                    departureTime: new Date(),
                    trafficModel: "bestguess"
                }
            };

            directionsService.route(request, function (result, status) {
                if (status === google.maps.DirectionsStatus.OK) {
                    drawTrafficRoutes(map, result);
                    addMarkers(map, bestRouteList, arrivalTimesList, waitTimesList);
                    console.log("hi", result);

                    // Store the polyline representation of the full route

                    // ✅ Extract meal-based polylines and store full route polyline
                    extractRoutePolyline(result, arrivalTimesList, departureTimesList, map);

                    // Add restaurant controls
                    addRestaurantFilterPanel(map);

                    // Search for restaurants along the route
                    findRestaurantsAlongRoute(map, result);
                } else {
                    alert("Could not display route. Error: " + status);
                }
            });

        } else {
            alert("Could not find city location: " + status);
        }
    });
}



window.initMap = initMap;


function fullmap() {
    document.getElementById('leftPart').style.display = 'none';
    document.getElementById('rightPart').classList.add('fullWidth');
    document.getElementById('itineraryBtn').classList.add('displayBtn');
    document.getElementById('viewmapBtn').classList.add('hideBtn');
}

function halfmap() {
    document.getElementById('leftPart').style.display = 'block';

    document.getElementById('leftPart').classList.remove('lessWidth');
    document.getElementById('rightPart').classList.remove('fullWidth');
    document.getElementById('itineraryBtn').classList.remove('displayBtn');
    document.getElementById('viewmapBtn').classList.remove('hideBtn');
}



// function extractMealPolylines(result, arrivalTimesList, departureTimesList) {
//     if (!result.routes || result.routes.length === 0) return { breakfastRoutes: [], lunchRoutes: [], dinnerRoutes: [] };

//     const route = result.routes[0];

//     // Define meal time ranges in minutes from midnight
//     const mealTimes = {
//         breakfast: [6 * 60, 10 * 60],   // 6:00 AM - 10:00 AM
//         lunch: [12 * 60, 15 * 60],      // 12:00 PM - 3:00 PM
//         dinner: [18 * 60, 22 * 60]      // 7:00 PM - 10:00 PM
//     };

//     // Separate arrays for different meal routes
//     let breakfastRoutes = [];
//     let lunchRoutes = [];
//     let dinnerRoutes = [];

//     // Loop through adjacent waypoints
//     for (let i = 0; i < arrivalTimesList.length; i++) {
//         let arrivalTime = arrivalTimesList[i];
//         let departureTime = departureTimesList[i];

//         // Check which meal time this segment falls under
//         for (const [meal, [start, end]] of Object.entries(mealTimes)) {
//             if ((arrivalTime >= start && arrivalTime <= end) || (departureTime >= start && departureTime <= end)) {
//                 let leg = route.legs[i];
//                 let segmentPolyline = [];

//                 // Extract polyline from step-by-step route data
//                 for (let j = 0; j < leg.steps.length; j++) {
//                     segmentPolyline.push(leg.steps[j].polyline.points);
//                 }

//                 // Store based on meal type
//                 if (meal === "breakfast") {
//                     breakfastRoutes.push(segmentPolyline);
//                 } else if (meal === "lunch") {
//                     lunchRoutes.push(segmentPolyline);
//                 } else if (meal === "dinner") {
//                     dinnerRoutes.push(segmentPolyline);
//                 }
//             }
//         }
//     }

//     console.log("Breakfast Routes:", breakfastRoutes);
//     console.log("Lunch Routes:", lunchRoutes);
//     console.log("Dinner Routes:", dinnerRoutes);

//     // routePolyline = dinnerRoutes.flat();
//     let concatenatedDinnerRoute = dinnerRoutes.flat().join('');
//     console.log("polyline :" , dinnerRoutes.route)
//     console.log("concat polyline :" , concatenatedDinnerRoute)


//     // routePolyline = concatenatedDinnerRoute;
//     return { breakfastRoutes, lunchRoutes, dinnerRoutes };
// }



function extractRoutePolyline(result, arrivalTimesList, departureTimesList, map) {
    if (!result.routes || result.routes.length === 0) return;

    const route = result.routes[0];

    // Meal time definitions in minutes from midnight
    // const mealTimes = {
    //     breakfast: [6 * 60, 10 * 60],   // 6:00 AM - 10:00 AM
    //     lunch: [12 * 60, 15 * 60],      // 12:00 PM - 3:00 PM
    //     dinner: [18 * 60, 22 * 60]      // 6:00 PM - 10:00 PM
    // };

    // Storage for different meal polylines
    let breakfastRoutes = [];
    let lunchRoutes = [];
    let dinnerRoutes = [];
    let defaultRoutes = [];

    let fullPolyline = [];  // Stores the entire concatenated polyline

    // Loop through each leg of the route
    for (let i = 0; i < route.legs.length; i++) {
        let leg = route.legs[i];
        let segmentPolyline = [];

        // Extract polyline from step-by-step route data
        for (let j = 0; j < leg.steps.length; j++) {
            segmentPolyline.push(leg.steps[j].polyline.points);
        }

        // Get arrival and departure times
        console.log("This is the arrival times list for polyline : " , arrivalTimesList);
        console.log("This is the departure times list for polyline : " , departureTimesList);
        let arrivalTime = arrivalTimesList[i];
        let departureTime = departureTimesList[i];
        console.log("This is the ARRIVAL TIME polyline : " , arrivalTime);
        console.log("This is the DEPARTURE TIME  polyline : " , departureTime);
        

        // Check if the segment falls under any meal time
        let assigned = false;
        for (const [meal, [start, end]] of Object.entries(mealTimes)) {
            if ((arrivalTime >= start && arrivalTime <= end) || (departureTime >= start && departureTime <= end)) {
                if (meal === "breakfast") {
                    breakfastRoutes.push(segmentPolyline);
                } else if (meal === "lunch") {
                    lunchRoutes.push(segmentPolyline);
                } else if (meal === "dinner") {
                    dinnerRoutes.push(segmentPolyline);
                }
                assigned = true;
                break;
            }
        }

        // If no meal time matches, assign it as a normal route
        if (!assigned) {
            defaultRoutes.push(segmentPolyline);
        }

        // Add to full polyline for concatenation
        fullPolyline.push(...segmentPolyline);
    }

    // Store the polylines in a global object with their meal types
    routePolylines = {
        breakfast: breakfastRoutes.flat(),
        lunch: lunchRoutes.flat(),
        dinner: dinnerRoutes.flat(),
        default: defaultRoutes.flat()
    };

    // Draw meal-based polylines with respective colors
    function drawPolyline(segments, color) {
        segments.forEach(segment => {
            const decodedPath = segment.map(encoded =>
                google.maps.geometry.encoding.decodePath(encoded)
            ).flat();  // Decode each part and flatten
            console.log("dghdghrghrghrhh" , decodedPath)
            new google.maps.Polyline({
                path: decodedPath,
                geodesic: true,
                strokeColor: color,
                strokeOpacity: 1.0,
                strokeWeight: 12,
                map: map
            });
        });
    }

    drawPolyline(breakfastRoutes, "#800020");  // Burgundy for breakfast
    drawPolyline(lunchRoutes, "#006400");  // Dark green for lunch
    drawPolyline(dinnerRoutes, "#000000");  // Black for dinner
    drawPolyline(defaultRoutes, "#0000FF");  // Blue for normal routes

    console.log("✅ Breakfast Routes:", breakfastRoutes);
    console.log("✅ Lunch Routes:", lunchRoutes);
    console.log("✅ Dinner Routes:", dinnerRoutes);
}

function findRestaurantsAlongRoute(map, result) {
    // Clear any existing restaurant markers
    clearRestaurantMarkers();

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
    
    for (let i = 0; i < numPoints; i++) {
        // Calculate a position from 0 to 1 along the route
        const position = i / (numPoints - 1 || 1);  // Avoid division by zero
        
        // Get the corresponding index in the decoded path
        const index = Math.floor(position * (pathLength - 1));
        
        // Get the LatLng point at this index
        const searchPoint = decodedPath[index];
        
        console.log(`Searching for ${mealType} at path index:`, index);
        
        // Stagger requests to avoid hitting API rate limits
        setTimeout(() => {
            performTextSearch(placesService, map, searchPoint, mealType);
        }, i * 300);
    }
}

function performTextSearch(placesService, map, location, mealType) {
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

    console.log(`Searching for: "${query}" at meal time: ${mealType}`);

    // Use the location directly - it should be a LatLng object
    const request = {
        location: location,
        radius: 300,
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
// Helper function to convert rupee values to Google Maps price level (0-4)
function convertRupeesToPriceLevel(rupees) {
    if (rupees <= 0) return 0;
    if (rupees < 300) return 1;
    if (rupees < 600) return 2;
    if (rupees < 1000) return 3;
    return 4;
}

// Helper function to convert price level to rupee range
function getPriceRangeText(level) {
    switch (level) {
        case 0: return "Any";
        case 1: return "Up to ₹300";
        case 2: return "₹300-₹600";
        case 3: return "₹600-₹1000";
        case 4: return "₹1000+";
        default: return "Any";
    }
}

function getPlaceDetails(placesService, map, place) {
    placesService.getDetails(
        {
            placeId: place.place_id,
            fields: ['name', 'rating', 'formatted_address', 'photo', 'types', 'user_ratings_total', 'price_level', 'review', 'website', 'geometry', 'vicinity']
        },
        (placeDetails, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK) {
                // No need to filter by price here as the text search already does that
                // Add marker to map
                const marker = addRestaurantMarker(map, placeDetails);
                restaurantMarkers.push(marker);
            }
        }
    );
}

function clearRestaurantMarkers() {
    // Remove all restaurant markers from the map
    // restaurantMarkers.forEach(marker => {
    //     marker.setMap(null);
    // });

    // // Clear the array
    // restaurantMarkers = [];
    showingRestaurants = false;
}

function addRestaurantMarker(map, place) {
    // Create a marker for the restaurant
    const marker = new google.maps.Marker({
        position: place.geometry.location,
        map: map,
        title: place.name,
        icon: {
            url: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png',
            scaledSize: new google.maps.Size(32, 32)
        },
        visible: showingRestaurants // Respect current visibility setting
    });

    // Create an info window with restaurant details
    const infoWindow = new google.maps.InfoWindow({
        content: `
      <div style="max-width: 300px">
        <h3 style="margin-top: 5px; margin-bottom: 5px;">${place.name}</h3>
        <p style="margin-top: 5px; margin-bottom: 5px;">Rating: ${place.rating ? place.rating.toFixed(1) + '/5' : 'N/A'} 
          ${place.user_ratings_total ? `(${place.user_ratings_total} reviews)` : ''}</p>
        <p style="margin-top: 5px; margin-bottom: 10px;">${place.vicinity || place.formatted_address || ''}</p>
        ${place.price_level ? `<p>Price Level: ${getPrice(place.price_level)}</p>` : ''}
        ${place.photos && place.photos.length > 0 ?
                `<img src="${place.photos[0].getUrl({ maxWidth: 200, maxHeight: 200 })}" alt="${place.name}" style="width:100%; max-width:200px;">` : ''}
         <button onclick="addOnRoute('${place.name}', ${place.geometry.location})"
    style="margin-top: 8px; padding: 8px 12px; background-color: #1a73e8; color: white; border: none; border-radius: 5px; cursor: pointer;">
    Add to Current Route
</button>

      </div>
    `
    });

    // Add click listener to open info window
    marker.addListener('click', () => {
        infoWindow.open(map, marker);
    });

    return marker;
}

function getPrice(level) {
    switch (level) {
        case 1: return '₹';
        case 2: return '₹₹';
        case 3: return '₹₹₹';
        case 4: return '₹₹₹₹';
        default: return 'N/A';
    }
}

function addRestaurantToggleButton(map) {
    // Create a div for the control
    const controlDiv = document.createElement('div');

    // Set CSS for the control border
    const controlUI = document.createElement('div');
    controlUI.style.backgroundColor = '#fff';
    controlUI.style.border = 'none';
    controlUI.style.borderRadius = '8px';
    controlUI.style.boxShadow = '0 1px 3px rgba(0,0,0,0.3)';
    controlUI.style.cursor = 'pointer';
    controlUI.style.marginTop = '10px';
    controlUI.style.marginRight = '10px';
    controlUI.style.textAlign = 'center';
    controlUI.title = 'Click to toggle restaurant markers';
    controlDiv.appendChild(controlUI);

    // Set CSS for the control interior
    const controlText = document.createElement('div');
    controlText.style.color = '#1a73e8';
    controlText.style.fontFamily = 'Roboto, Arial, sans-serif';
    controlText.style.fontSize = '14px';
    controlText.style.fontWeight = '500';
    controlText.style.lineHeight = '38px';
    controlText.style.paddingLeft = '12px';
    controlText.style.paddingRight = '12px';
    controlText.innerHTML = 'Show Restaurants';
    controlUI.appendChild(controlText);

    // Setup the click event listener
    controlUI.addEventListener('click', function () {
        toggleRestaurantMarkers();

        // Update button text
        if (showingRestaurants) {
            controlText.innerHTML = 'Hide Restaurants';
        } else {
            controlText.innerHTML = 'Show Restaurants';
        }
    });

    // Add the control to the map
    map.controls[google.maps.ControlPosition.TOP_RIGHT].push(controlDiv);
}

function addRestaurantFilterPanel(map) {
    // Create main filter panel container
    const filterPanel = document.createElement('div');
    filterPanel.className = 'filter-panel';
    filterPanel.style.backgroundColor = '#fff';
    filterPanel.style.border = 'none';
    filterPanel.style.borderRadius = '8px';
    filterPanel.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
    filterPanel.style.margin = '10px';
    filterPanel.style.padding = '6px';
    filterPanel.style.width = '500px';
    filterPanel.style.maxHeight = '50vh';
    filterPanel.style.overflowY = 'auto';
    // filterPanel.style.display = 'flex';
    filterPanel.style.display = 'none';
    filterPanel.style.flexDirection = 'column';
    filterPanel.style.transition = 'all 0.3s ease';

    // Add a subtle hover effect
    filterPanel.addEventListener('mouseover', function () {
        this.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
    });

    filterPanel.addEventListener('mouseout', function () {
        this.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
    });

    // Create title
    const title = document.createElement('h3');
    title.textContent = 'Find Restaurants';
    title.style.margin = '0 0 16px 0';
    title.style.fontFamily = 'Google Sans, Roboto, Arial, sans-serif';
    title.style.fontSize = '18px';
    title.style.fontWeight = '500';
    title.style.color = '#202124';
    filterPanel.appendChild(title);

    // Add keyword search input
    const keywordSection = document.createElement('div');
    keywordSection.style.marginBottom = '20px';

    const keywordLabel = document.createElement('label');
    keywordLabel.htmlFor = 'restaurant-keyword';
    keywordLabel.textContent = 'Search for:';
    keywordLabel.style.display = 'block';
    keywordLabel.style.fontFamily = 'Roboto, Arial, sans-serif';
    keywordLabel.style.fontSize = '14px';
    keywordLabel.style.fontWeight = '500';
    keywordLabel.style.color = '#5f6368';
    keywordLabel.style.marginBottom = '8px';
    keywordSection.appendChild(keywordLabel);

    const keywordInput = document.createElement('input');
    keywordInput.type = 'text';
    keywordInput.id = 'restaurant-keyword';
    keywordInput.placeholder = 'Pizza, burger, cafe...';
    keywordInput.style.width = '100%';
    keywordInput.style.padding = '8px 12px';
    keywordInput.style.boxSizing = 'border-box';
    keywordInput.style.borderRadius = '4px';
    keywordInput.style.border = '1px solid #dadce0';
    keywordInput.style.fontSize = '14px';
    keywordInput.style.transition = 'border 0.2s';

    // Style focus effect
    keywordInput.addEventListener('focus', function () {
        this.style.border = '2px solid #1a73e8';
        this.style.outline = 'none';
    });

    keywordInput.addEventListener('blur', function () {
        this.style.border = '1px solid #dadce0';
    });

    keywordInput.addEventListener('input', function () {
        filterSettings.keyword = this.value;
    });

    keywordSection.appendChild(keywordInput);
    filterPanel.appendChild(keywordSection);

    // Divider
    const divider1 = createDivider();
    filterPanel.appendChild(divider1);

    // Create cuisine filter section
    const cuisineSection = document.createElement('div');
    cuisineSection.style.marginBottom = '20px';

    const cuisineLabel = document.createElement('div');
    cuisineLabel.textContent = 'Cuisine Type';
    cuisineLabel.style.fontFamily = 'Roboto, Arial, sans-serif';
    cuisineLabel.style.fontSize = '14px';
    cuisineLabel.style.fontWeight = '500';
    cuisineLabel.style.color = '#5f6368';
    cuisineLabel.style.marginBottom = '8px';
    cuisineSection.appendChild(cuisineLabel);

    // Create cuisine chip container for horizontal scrolling
    const cuisineChipContainer = document.createElement('div');
    cuisineChipContainer.style.display = 'flex';
    cuisineChipContainer.style.flexWrap = 'wrap';
    cuisineChipContainer.style.gap = '8px';
    cuisineChipContainer.style.marginBottom = '8px';

    // Common cuisine types
    const cuisines = ['Italian', 'Chinese', 'South Indian', 'Mughlai', 'Indian', 'Mexican', 'Japanese', 'American'];

    // Create chip-style buttons for each cuisine
    cuisines.forEach(cuisine => {
        const chip = document.createElement('div');
        chip.className = 'cuisine-chip';
        chip.dataset.cuisine = cuisine;
        chip.textContent = cuisine;
        chip.style.display = 'inline-flex';
        chip.style.alignItems = 'center';
        chip.style.padding = '4px 12px';
        chip.style.backgroundColor = '#f1f3f4';
        chip.style.borderRadius = '16px';
        chip.style.fontFamily = 'Roboto, Arial, sans-serif';
        chip.style.fontSize = '14px';
        chip.style.color = '#202124';
        chip.style.cursor = 'pointer';
        chip.style.transition = 'all 0.2s';

        // Add selection state
        chip.addEventListener('click', function () {
            this.classList.toggle('selected');

            if (this.classList.contains('selected')) {
                this.style.backgroundColor = '#e8f0fe';
                this.style.color = '#1a73e8';
            } else {
                this.style.backgroundColor = '#f1f3f4';
                this.style.color = '#202124';
            }

            updateCuisineFilter();
        });

        cuisineChipContainer.appendChild(chip);
    });

    cuisineSection.appendChild(cuisineChipContainer);
    filterPanel.appendChild(cuisineSection);

    // Divider
    const divider2 = createDivider();
    filterPanel.appendChild(divider2);

    // Create vegetarian filter section with toggle switch
    const vegSection = document.createElement('div');
    vegSection.style.marginBottom = '20px';
    vegSection.style.display = 'flex';
    vegSection.style.justifyContent = 'space-between';
    vegSection.style.alignItems = 'center';

    const vegLabel = document.createElement('label');
    vegLabel.htmlFor = 'vegetarian-toggle';
    vegLabel.textContent = 'Vegetarian Options Only';
    vegLabel.style.fontFamily = 'Roboto, Arial, sans-serif';
    vegLabel.style.fontSize = '14px';
    vegLabel.style.fontWeight = '500';
    vegLabel.style.color = '#5f6368';
    vegSection.appendChild(vegLabel);

    // Create toggle switch
    const toggleContainer = document.createElement('div');
    toggleContainer.className = 'toggle-container';
    toggleContainer.style.position = 'relative';
    toggleContainer.style.width = '36px';
    toggleContainer.style.height = '14px';

    const toggleBackground = document.createElement('div');
    toggleBackground.className = 'toggle-background';
    toggleBackground.style.position = 'absolute';
    toggleBackground.style.top = '0';
    toggleBackground.style.left = '0';
    toggleBackground.style.width = '100%';
    toggleBackground.style.height = '100%';
    toggleBackground.style.backgroundColor = '#bdc1c6';
    toggleBackground.style.borderRadius = '7px';
    toggleBackground.style.transition = 'background-color 0.2s';

    const toggleButton = document.createElement('div');
    toggleButton.className = 'toggle-button';
    toggleButton.style.position = 'absolute';
    toggleButton.style.top = '-3px';
    toggleButton.style.left = '0';
    toggleButton.style.width = '20px';
    toggleButton.style.height = '20px';
    toggleButton.style.backgroundColor = '#ffffff';
    toggleButton.style.borderRadius = '50%';
    toggleButton.style.boxShadow = '0 1px 3px rgba(0,0,0,0.4)';
    toggleButton.style.transition = 'left 0.2s, background-color 0.2s';

    toggleContainer.appendChild(toggleBackground);
    toggleContainer.appendChild(toggleButton);

    // Toggle functionality
    toggleContainer.addEventListener('click', function () {
        const isActive = toggleButton.style.left === '16px';

        if (isActive) {
            toggleButton.style.left = '0';
            toggleBackground.style.backgroundColor = '#bdc1c6';
            filterSettings.vegetarianOnly = false;
        } else {
            toggleButton.style.left = '16px';
            toggleBackground.style.backgroundColor = '#aecbfa';
            toggleButton.style.backgroundColor = '#1a73e8';
            filterSettings.vegetarianOnly = true;
        }
    });

    vegSection.appendChild(toggleContainer);
    filterPanel.appendChild(vegSection);

    // Divider
    const divider3 = createDivider();
    filterPanel.appendChild(divider3);

    // Add price range filter with numerical input
    const priceSection = document.createElement('div');
    priceSection.style.marginBottom = '30px';

    const priceHeader = document.createElement('div');
    priceHeader.style.display = 'flex';
    priceHeader.style.justifyContent = 'space-between';
    priceHeader.style.alignItems = 'center';
    priceHeader.style.marginBottom = '12px';

    const priceLabel = document.createElement('div');
    priceLabel.textContent = 'Price Range';
    priceLabel.style.fontFamily = 'Roboto, Arial, sans-serif';
    priceLabel.style.fontSize = '14px';
    priceLabel.style.fontWeight = '500';
    priceLabel.style.color = '#5f6368';
    priceHeader.appendChild(priceLabel);

    // Price preset chips
    const pricePresets = document.createElement('div');
    pricePresets.style.display = 'flex';
    pricePresets.style.gap = '8px';
    pricePresets.style.marginBottom = '16px';

    // Create preset options
    const createPresetChip = (label, minVal, maxVal) => {
        const chip = document.createElement('div');
        chip.className = 'price-preset-chip';
        chip.textContent = label;
        chip.style.padding = '4px 12px';
        chip.style.backgroundColor = '#f1f3f4';
        chip.style.borderRadius = '16px';
        chip.style.fontFamily = 'Roboto, Arial, sans-serif';
        chip.style.fontSize = '14px';
        chip.style.color = '#202124';
        chip.style.cursor = 'pointer';
        chip.style.transition = 'all 0.2s';

        chip.addEventListener('click', function () {
            // Deselect all chips
            document.querySelectorAll('.price-preset-chip').forEach(c => {
                c.style.backgroundColor = '#f1f3f4';
                c.style.color = '#202124';
            });

            // Select this chip
            this.style.backgroundColor = '#e8f0fe';
            this.style.color = '#1a73e8';

            // Update inputs
            minPriceInput.value = minVal;
            maxPriceInput.value = maxVal;

            // Update filter settings
            filterSettings.priceRange.min = minVal;
            filterSettings.priceRange.max = maxVal;

            // Update the price range text
            updatePriceRangeText();
        });

        return chip;
    };

    const inexpensiveChip = createPresetChip('₹', 0, 300);
    const moderateChip = createPresetChip('₹₹', 300, 600);
    const expensiveChip = createPresetChip('₹₹₹', 600, 1000);
    const veryExpensiveChip = createPresetChip('₹₹₹₹', 1000, 3000);

    pricePresets.appendChild(inexpensiveChip);
    pricePresets.appendChild(moderateChip);
    pricePresets.appendChild(expensiveChip);
    pricePresets.appendChild(veryExpensiveChip);

    priceSection.appendChild(priceHeader);
    priceSection.appendChild(pricePresets);

    // Min-max price inputs
    const priceInputContainer = document.createElement('div');
    priceInputContainer.style.display = 'flex';
    priceInputContainer.style.alignItems = 'center';
    priceInputContainer.style.gap = '8px';

    // Min price input
    const minPriceContainer = document.createElement('div');
    minPriceContainer.style.flex = '1';

    const minPriceLabel = document.createElement('label');
    minPriceLabel.htmlFor = 'min-price';
    minPriceLabel.textContent = 'Min (₹)';
    minPriceLabel.style.display = 'block';
    minPriceLabel.style.fontFamily = 'Roboto, Arial, sans-serif';
    minPriceLabel.style.fontSize = '12px';
    minPriceLabel.style.color = '#5f6368';
    minPriceLabel.style.marginBottom = '4px';

    const minPriceInput = document.createElement('input');
    minPriceInput.type = 'number';
    minPriceInput.id = 'min-price';
    minPriceInput.min = '0';
    minPriceInput.value = filterSettings.priceRange.min;
    minPriceInput.style.width = '100%';
    minPriceInput.style.padding = '8px';
    minPriceInput.style.boxSizing = 'border-box';
    minPriceInput.style.borderRadius = '4px';
    minPriceInput.style.border = '1px solid #dadce0';
    minPriceInput.style.fontSize = '14px';

    minPriceInput.addEventListener('input', function () {
        const val = parseInt(this.value, 10) || 0;
        filterSettings.priceRange.min = val;
        updatePriceRangeText();
    });

    minPriceContainer.appendChild(minPriceLabel);
    minPriceContainer.appendChild(minPriceInput);

    // Max price input
    const maxPriceContainer = document.createElement('div');
    maxPriceContainer.style.flex = '1';

    const maxPriceLabel = document.createElement('label');
    maxPriceLabel.htmlFor = 'max-price';
    maxPriceLabel.textContent = 'Max (₹)';
    maxPriceLabel.style.display = 'block';
    maxPriceLabel.style.fontFamily = 'Roboto, Arial, sans-serif';
    maxPriceLabel.style.fontSize = '12px';
    maxPriceLabel.style.color = '#5f6368';
    maxPriceLabel.style.marginBottom = '4px';

    const maxPriceInput = document.createElement('input');
    maxPriceInput.type = 'number';
    maxPriceInput.id = 'max-price';
    maxPriceInput.min = '0';
    maxPriceInput.value = filterSettings.priceRange.max;
    maxPriceInput.style.width = '100%';
    maxPriceInput.style.padding = '8px';
    maxPriceInput.style.boxSizing = 'border-box';
    maxPriceInput.style.borderRadius = '4px';
    maxPriceInput.style.border = '1px solid #dadce0';
    maxPriceInput.style.fontSize = '14px';

    maxPriceInput.addEventListener('input', function () {
        const val = parseInt(this.value, 10) || 0;
        filterSettings.priceRange.max = val;
        updatePriceRangeText();
    });

    maxPriceContainer.appendChild(maxPriceLabel);
    maxPriceContainer.appendChild(maxPriceInput);

    priceInputContainer.appendChild(minPriceContainer);
    priceInputContainer.appendChild(maxPriceContainer);
    priceSection.appendChild(priceInputContainer);

    // Price range description text
    const priceRangeText = document.createElement('div');
    priceRangeText.id = 'price-range-text';
    priceRangeText.style.fontFamily = 'Roboto, Arial, sans-serif';
    priceRangeText.style.fontSize = '13px';
    priceRangeText.style.color = '#5f6368';
    priceRangeText.style.marginTop = '8px';
    priceRangeText.style.textAlign = 'center';

    function updatePriceRangeText() {
        const min = filterSettings.priceRange.min;
        const max = filterSettings.priceRange.max;

        if (min === 0 && max >= 3000) {
            priceRangeText.textContent = 'Any price range';
        } else if (min === 0) {
            priceRangeText.textContent = `Up to ₹${max}`;
        } else if (max >= 3000) {
            priceRangeText.textContent = `₹${min}+`;
        } else {
            priceRangeText.textContent = `₹${min} - ₹${max}`;
        }
    }

    // Initialize
    updatePriceRangeText();
    priceSection.appendChild(priceRangeText);

    filterPanel.appendChild(priceSection);

    // Button container to ensure it stays at the bottom
    const buttonContainer = document.createElement('div');
    buttonContainer.style.marginTop = 'auto';
    buttonContainer.style.paddingTop = '15px';

    // Create search button
    const searchButton = document.createElement('button');
    searchButton.textContent = 'Search Along Route';
    searchButton.style.backgroundColor = '#1a73e8';
    searchButton.style.border = 'none';
    searchButton.style.color = 'white';
    searchButton.style.padding = '0 24px';
    searchButton.style.height = '40px';
    searchButton.style.borderRadius = '20px';
    searchButton.style.cursor = 'pointer';
    searchButton.style.fontFamily = 'Google Sans, Roboto, Arial, sans-serif';
    searchButton.style.fontSize = '15px';
    searchButton.style.fontWeight = '500';
    searchButton.style.width = '100%';
    searchButton.style.boxShadow = '0 1px 2px rgba(0,0,0,0.3)';
    searchButton.style.transition = 'all 0.2s';
    searchButton.style.zIndex = '10';
    searchButton.style.position = 'sticky';
    searchButton.style.bottom = '5px';

    // Hover and active states
    searchButton.addEventListener('mouseover', function () {
        this.style.backgroundColor = '#1765cc';
        this.style.boxShadow = '0 1px 3px rgba(0,0,0,0.4)';
    });

    searchButton.addEventListener('mouseout', function () {
        this.style.backgroundColor = '#1a73e8';
        this.style.boxShadow = '0 1px 2px rgba(0,0,0,0.3)';
    });

    searchButton.addEventListener('mousedown', function () {
        this.style.backgroundColor = '#185abc';
    });

    searchButton.addEventListener('mouseup', function () {
        this.style.backgroundColor = '#1765cc';
    });

    searchButton.addEventListener('click', function () {
        // Show loading state
        this.textContent = 'Searching...';
        this.disabled = true;
        this.style.backgroundColor = '#4285f4';

        // Use stored polyline for search
        if (routePolylines) {
            refreshRestaurantsAlongRoute(map);

            // Reset button after a delay
            setTimeout(() => {
                this.textContent = 'Search Along Route';
                this.disabled = false;
                this.style.backgroundColor = '#1a73e8';
            }, 1000);
        } else {
            alert("Route data not available. Please try again.");
            this.textContent = 'Search Along Route';
            this.disabled = false;
        }
    });

    buttonContainer.appendChild(searchButton);
    filterPanel.appendChild(buttonContainer);

    // Add to map controls
    map.controls[google.maps.ControlPosition.LEFT_TOP].push(filterPanel);

    // Function to create a divider
    function createDivider() {
        const divider = document.createElement('div');
        divider.style.height = '1px';
        divider.style.backgroundColor = '#e8eaed';
        divider.style.margin = '16px 0';
        return divider;
    }

    // Function to update cuisine filter settings
    function updateCuisineFilter() {
        // Get all selected cuisines
        const selectedCuisines = [];
        document.querySelectorAll('.cuisine-chip.selected').forEach(chip => {
            selectedCuisines.push(chip.dataset.cuisine);
        });

        // Update filter settings
        filterSettings.cuisines = selectedCuisines;
    }
}

function toggleFilterPanel() {
    const filterPanel = document.querySelector('.filter-panel');

    if (filterPanel.style.display === 'none' || filterPanel.style.display === '') {
        filterPanel.style.display = 'flex'; // Show the panel
    } else {
        filterPanel.style.display = 'none'; // Hide the panel
    }
}

function addFilterPanelToggleButton(map) {
    const FilterBtn = document.createElement('div');
    const controlUI = document.createElement('div');

    // Styling the button
    controlUI.style.backgroundColor = '#fff';
    controlUI.style.border = 'none';
    controlUI.style.borderRadius = '8px';
    controlUI.style.boxShadow = '0 1px 3px rgba(0,0,0,0.3)';
    controlUI.style.cursor = 'pointer';
    controlUI.style.marginBottom = '20px'; // Adjust spacing from bottom
    controlUI.style.marginLeft = '20px';  // Adjust spacing from left
    controlUI.style.padding = '8px 12px';
    controlUI.style.textAlign = 'center';
    controlUI.style.position = 'absolute';
    controlUI.style.bottom = '10px'; // Move to bottom
    controlUI.style.left = '10px'; // Move to left
    controlUI.title = 'Click to toggle restaurant filter panel';

    FilterBtn.appendChild(controlUI);

    const controlText = document.createElement('div');
    controlText.style.color = '#1a73e8';
    controlText.style.fontFamily = 'Roboto, Arial, sans-serif';
    controlText.style.fontSize = '14px';
    controlText.style.fontWeight = '500';
    controlText.innerHTML = 'Filter Restaurants';
    controlUI.appendChild(controlText);

    let isPanelVisible = false; // Track state

    controlUI.addEventListener('click', function () {
        toggleFilterPanel(); // Call function to toggle panel
        isPanelVisible = !isPanelVisible; // Toggle state
        controlText.innerHTML = isPanelVisible ? 'Close Filter' : 'Filter Restaurants';
    });

    // Append the button to the map at the bottom-left position
    map.controls[google.maps.ControlPosition.BOTTOM_CENTER].push(FilterBtn);
}

function refreshRestaurantsAlongRoute(map,routePolyline,mealType) {
    // Clear current markers
    // clearRestaurantMarkers();

    // Create a Places service
    const placesService = new google.maps.places.PlacesService(map);

    // Search along route with updated filters
    for (const [mealType, polyline] of Object.entries(routePolylines)) {
        if (polyline && polyline.length > 0) {
            searchAlongRouteMealSpecific(placesService, map, polyline, mealType);
        }
    }}

// function toggleRestaurantMarkers() {

//     showingRestaurants = !showingRestaurants;

//     restaurantMarkers.forEach(marker => {
//         marker.setVisible(showingRestaurants);
//     });

// }

function toggleRestaurantMarkers() {
    showingRestaurants = !showingRestaurants;
    restaurantMarkers.forEach(marker => {
        if (marker) {
            marker.setVisible(showingRestaurants);
        }
    });
}

function drawTrafficRoutes(map, result) {
    var legs = result.routes[0].legs;

    legs.forEach((leg, index) => {
        var trafficLevel = estimateTraffic(leg.duration.value, leg.distance.value);
        var polylineColor = getTrafficColor(trafficLevel);

        new google.maps.Polyline({
            path: leg.steps.flatMap(step => step.path),
            geodesic: true,
            strokeColor: polylineColor,
            strokeOpacity: 1.0,
            strokeWeight: 5,
            map: map
        });
    });
}

function estimateTraffic(duration, distance) {
    var avgSpeed = (distance / duration) * 3.6;
    if (avgSpeed > 25) return "light";
    if (avgSpeed > 15) return "moderate";
    return "heavy";
}

function getTrafficColor(trafficLevel) {
    switch (trafficLevel) {
        case "light": return "blue";
        case "moderate": return "orange";
        case "heavy": return "red";
        default: return "black";
    }
} function addMarkers(map, bestRouteList, adjustedArrivalTimes, adjustedWaitTimes) {
    var geocoder = new google.maps.Geocoder();
    var labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"; //  Supports up to 26 locations

    bestRouteList.forEach((place, index) => {
        geocoder.geocode({ 'address': place }, function (results, status) {
            if (status === 'OK') {
                var label = (index === 0 || index === bestRouteList.length - 1) ? "Hotel" : labels[index - 1] || "?";

                var marker = new google.maps.Marker({
                    map: map,
                    position: results[0].geometry.location,
                    title: place,
                    icon: { url: "http://maps.google.com/mapfiles/ms/icons/red-dot.png" }
                });

                //  Correct Arrival & Wait Times
                var arrivalTime = (index === 0 || index === bestRouteList.length - 1)
                    ? "Start/End Point"
                    : `Arrival Time: ${formatTime(adjustedArrivalTimes[index-1] || 0)}`;

                var waitTime = (index > 0 && index < bestRouteList.length - 1)
                    ? `Wait Time: ${formatWaitTime(adjustedWaitTimes[index] || 0)}`
                    : "";

                var infoWindow = new google.maps.InfoWindow({
                    content: `<div class="info-window">
                    <strong>${place}</strong><br>${arrivalTime}<br>${waitTime}
                    <br><em>Fetching details...</em></div>`
                });

                marker.addListener('click', function () {
                    fetchPlaceDetails(place, infoWindow, marker, map, arrivalTime, waitTime);
                });

                addMarkerLabel(map, marker, label);  //  Add styled label near marker
            }
        });
    });
}

//  Function to add styled marker labels (Blue box, White text, Bold)
function addMarkerLabel(map, marker, label) {
    var labelDiv = document.createElement('div');
    labelDiv.className = 'marker-label';
    labelDiv.innerText = label;
    document.body.appendChild(labelDiv);

    var overlay = new google.maps.OverlayView();
    overlay.onAdd = function () {
        var layer = this.getPanes().overlayMouseTarget;
        layer.appendChild(labelDiv);
    };
    overlay.draw = function () {
        var projection = this.getProjection();
        var position = projection.fromLatLngToDivPixel(marker.getPosition());
        labelDiv.style.left = (position.x - 10) + "px";  //  Center label horizontally
        labelDiv.style.top = (position.y - 45) + "px";   //  Position above marker
    };
    overlay.setMap(map);

    labelDiv.style.cssText = `
    position: absolute;
    background-color: #007bff; /*  Blue box */
    color: white; /*  White text */
    font-size: 14px; /*  Bigger font */
    font-weight: bold; /*  Bold text */
    padding: 5px 10px; /*  Padding for box shape */
    border-radius: 5px; /*  Rounded corners */
    box-shadow: 2px 2px 5px rgba(0, 0, 0, 0.3); /*  Slight shadow for visibility */
    transform: translate(-50%, -50%);
    text-align: center;
    cursor: pointer;
`;

    //  Ensure label click also opens sidebar
    labelDiv.addEventListener("click", function () {
        google.maps.event.trigger(marker, "click");
        openSidebar();
    });

    marker.addListener("click", function () {
        // openSidebar();
    });
}

//  Fetch Google Place Details & Update Sidebar
function fetchPlaceDetails(place, infoWindow, marker, map, arrivalTime, waitTime) {
    var placesService = new google.maps.places.PlacesService(map);
    var hotelName = "{{ hotel_name }}";
    var city = "{{ city }}";
    hotelName = hotelName.replace(city, "").trim();

    placesService.findPlaceFromQuery({
        query: place,
        fields: ['place_id']
    }, function (results, status) {
        if (status === google.maps.places.PlacesServiceStatus.OK && results.length > 0) {
            var placeId = results[0].place_id;


            placesService.getDetails({
                placeId: placeId,
                fields: ['name', 'formatted_address', 'rating', 'user_ratings_total', 'photos']
            }, function (placeDetails, status) {
                if (status === google.maps.places.PlacesServiceStatus.OK) {
                    var photoUrls = placeDetails.photos?.map(photo => photo.getUrl({ maxWidth: 400 })) || [];
                    if (placeDetails.name != hotelName) {
                        var sidebarContent = `
    <div class="sidebar-place-details">
        <h2 class="place-title">${placeDetails.name}</h2>
        
        <div class="info-section">
            <div class="info-item">
                <span class="info-icon">📍</span>
                <div class="info-content">
                    <span class="info-label">Address</span>
                    <span class="info-value">${placeDetails.formatted_address}</span>
                </div>
            </div>
            
            <div class="info-item">
                <span class="info-icon">⭐</span>
                <div class="info-content">
                    <span class="info-label">Rating</span>
                    <span class="info-value">${placeDetails.rating} <span class="reviews-count">(${placeDetails.user_ratings_total} reviews)</span></span>
                </div>
            </div>
            
            
            <div class="info-item">
              <span class="info-icon">🕒</span>
              <div class="info-content">
                <span class="info-label">Arrival</span>
                <span class="info-value">${arrivalTime.replace("Arrival Time: ", "")}</span>
              </div>
            </div>
            
            <div class="info-item">
              <span class="info-icon">⏳</span>
              <div class="info-content">
                <span class="info-label">Wait Time</span>
                <span class="info-value">${waitTime.replace("Wait Time: ", "")}</span>
              </div>
            </div>
            </div>
        </div>
        
        <div class="divider"></div>
        
        <div class="image-grid">
            <div class="image-row">
                <div class="image-cell">
                    <img src="${photoUrls[0] || 'https://via.placeholder.com/300'}" alt="Location view">
                </div>
                <div class="image-cell">
                    <img src="${photoUrls[1] || 'https://via.placeholder.com/300'}" alt="Location view">
                </div>
            </div>
            <div class="image-row">
                <div class="image-cell">
                    <img src="${photoUrls[2] || 'https://via.placeholder.com/300'}" alt="Location view">
                </div>
                <div class="image-cell">
                    <img src="${photoUrls[3] || 'https://via.placeholder.com/300'}" alt="Location view">
                </div>
            </div>
        </div>
    </div>
`;
                    }
                    else {
                        var sidebarContent = `
    <div class="sidebar-place-details">
        <h2 class="place-title">${placeDetails.name}</h2>
        
        <div class="info-section">
            <div class="info-item">
                <span class="info-icon">📍</span>
                <div class="info-content">
                    <span class="info-label">Address</span>
                    <span class="info-value">${placeDetails.formatted_address}</span>
                </div>
            </div>
            
            <div class="info-item">
                <span class="info-icon">⭐</span>
                <div class="info-content">
                    <span class="info-label">Rating</span>
                    <span class="info-value">${placeDetails.rating} <span class="reviews-count">(${placeDetails.user_ratings_total} reviews)</span></span>
                </div>
            </div>
                    <div class="divider"></div>
        
        <div class="image-grid">
            <div class="image-row">
                <div class="image-cell">
                    <img src="${photoUrls[0] || 'https://via.placeholder.com/300'}" alt="Location view">
                </div>
                <div class="image-cell">
                    <img src="${photoUrls[1] || 'https://via.placeholder.com/300'}" alt="Location view">
                </div>
            </div>
            <div class="image-row">
                <div class="image-cell">
                    <img src="${photoUrls[2] || 'https://via.placeholder.com/300'}" alt="Location view">
                </div>
                <div class="image-cell">
                    <img src="${photoUrls[3] || 'https://via.placeholder.com/300'}" alt="Location view">
                </div>
            </div>
        </div>
    </div>
`;



                    }

                    //  Display sidebar with details
                    // document.getElementById("sidebar-content").innerHTML = sidebarContent;
                    // openSidebar();
                    openPopup(sidebarContent);
                }
            });
        }
    });
}

//  Function to Open the Pop-up (Simulates an alert box)
function openPopup(content) {
    var popup = document.getElementById("alert-popup");
    var popupContent = document.getElementById("popup-content");

    popupContent.innerHTML = content; // Set content dynamically
    popup.style.display = "block";  // Show the pop-up
}

//  Function to Close the Pop-up
function closePopup() {
    document.getElementById("alert-popup").style.display = "none";
}


//  Format Arrival Time
function formatTime(minutes) {
    var hours = Math.floor(minutes / 60);
    var mins = minutes % 60;
    var period = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return `${hours}:${mins.toString().padStart(2, "0")} ${period}`;
}

//  Format Wait Time
function formatWaitTime(minutes) {
    if (minutes <= 0) return "0 mins";
    var hours = Math.floor(minutes / 60);
    var mins = minutes % 60;
    return hours > 0 ? `${hours} hrs ${mins} mins` : `${mins} mins`;
}

// //  Fix: Ensure Sidebar Displays Correctly
// function openSidebar() {
//     var sidebar = document.getElementById("info-sidebar");
//     sidebar.classList.add("show-sidebar");
// }

//  Fix: Ensure Sidebar Closes When Needed
// function closeSidebar() {
//     var sidebar = document.getElementById("info-sidebar");
//     sidebar.classList.remove("show-sidebar");
// }