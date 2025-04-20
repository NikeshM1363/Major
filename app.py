from flask import Flask, request, jsonify, render_template, url_for, redirect
import json
# from openai import OpenAI
import re
import pandas as pd
import logging
import numpy as np
from place_recommender import recommend_places
from tsp_route_optimizer import tsp_route_optimizer
from time_optimization import (
    optimize_route_with_end_time,
    format_wait_time,
    get_travel_time,
    format_time,
    get_open_times,
    find_next_available_time_window,
    create_detailed_itinerary_with_time_windows,
    load_json,
    calculate_detailed_itinerary
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('route_optimization.log')
    ]
)

# OPENAI_API_KEY = ""

# Initialize Flask app
app = Flask(__name__, template_folder=".")
# client = OpenAI(api_key=OPENAI_API_KEY)

# Google Maps API key
API_KEY = "AIzaSyDVI_HLPb1lYJg7HnL69ilqGc4l1AkzmcY"  # Use your existing API key

def log_route_details(route, arrival_times, departure_times, wait_times, description="Route Details"):
    """
    Detailed logging of route information in a human-readable format
    """
    logging.info("\n" + "="*50)
    logging.info(f"{description}")
    logging.info("="*50)
    
    # Print route overview
    logging.info("\n🗺️ Route Overview:")
    for i, place in enumerate(route):
        try:
            logging.info(f"{i+1}. {place}")
        except Exception as e:
            logging.error(f"{i+1}. Unable to print place name: {e}")
    
    # Print detailed timing information
    logging.info("\n⏰ Timing Details:")
    for i in range(len(route)):
        try:
            arrival_time = format_time(int(arrival_times[i+1])) if i + 1 < len(arrival_times) else "N/A"
            departure_time = format_time(int(departure_times[i])) if i < len(departure_times) else "N/A"
            wait_time = int(wait_times[i]) if i < len(wait_times) else "N/A"

            logging.info(f"{route[i]}:")
            logging.info(f"  - Arrival Time: {arrival_time}")  # Printing shifted arrival time
            logging.info(f"  - Departure Time: {departure_time}")
            logging.info(f"  - Wait Time: {wait_time} minutes")
        except Exception as e:
            logging.error(f"Error logging details for {route[i]}: {e}")

    logging.info("\n" + "="*50 + "\n")

def convert_to_minutes(time_str):
    """Convert HH:MM (24 hr) format to minutes from midnight."""
    hours, minutes = map(int, time_str.split(":"))
    return hours * 60 + minutes

# MAIN APP ROUTE HANDLERS
@app.route("/")
def home():
    """Render the chatbot UI."""
    return render_template("index.html") 

@app.route("/trip_form", methods=["GET"])
def trip_form():
    """Render the trip planning form."""
    return render_template("index.html")

@app.route("/submit", methods=["POST"])
def submit():
    """Process travel recommendations and optimize the itinerary."""
    city = request.form["city"]
    trip_type = request.form["trip_type"]
    budget = float(request.form["budget"])
    hotel_name = request.form["hotel_name"]
    start_time = request.form["start_time"]
    end_time = request.form["end_time"]
    start_time = convert_to_minutes(start_time)
    end_time = convert_to_minutes(end_time)
    
    if end_time - start_time > 120:
        logging.info("Route generation started")
        
        # Step 1: Get recommended places
        recommendations_df = recommend_places(city, trip_type, budget)
        recommended_places = recommendations_df["place_name"].tolist()
        recommendations_df.to_json("recommended_places.json", orient="records", indent=4)

        # Step 2: Optimize route
        optimized_route, total_distance = tsp_route_optimizer(hotel_name)

        # Load place data
        with open("data.json", "r") as file:
            data = json.load(file)
        df = pd.DataFrame(data).set_index("place_name")

        # Step 3: Time Optimization with multiple time windows
        (
            best_route_list,
            min_wait_time,
            best_itinerary,
            arrival_times_list,
            departure_times_list,
            wait_times_list,
            early_finish
        ) = optimize_route_with_end_time(
            optimized_route, df, API_KEY, start_time, end_time
        )
        
        # Convert to integers for template
        arrival_times_list = [int(time) for time in arrival_times_list]
        wait_times_list = [int(wait) for wait in wait_times_list]
        departure_times_list = [int(depart) for depart in departure_times_list]
        
        # Log route details
        log_route_details(
            best_route_list, 
            arrival_times_list, 
            departure_times_list, 
            wait_times_list, 
            "Initial Route Generation"
        )
        
        return render_template(
            "fullmap.html",
            city=city,
            trip_type=trip_type,
            budget=budget,
            hotel_name=hotel_name,
            start_time=start_time,
            end_time=end_time,
            recommendations=recommended_places,
            optimized_route=optimized_route,
            total_distance=round(total_distance, 2),
            best_route_list=best_route_list,
            min_wait_time=min_wait_time,
            best_itinerary=best_itinerary,
            arrival_times_list=arrival_times_list,
            wait_times_list=wait_times_list,
            departure_times_list=departure_times_list  
        )
    else:
        return render_template("error.html", message="End time must be at least 75 minutes after start time.")

@app.route("/update_route_with_restaurant", methods=["POST"])
def update_route_with_restaurant():
    """
    Update the route by adding a restaurant at the optimal position.
    Handles multiple time windows for places and uses marker/polyline information.
    """
    try:
        data = request.json
        logging.info(f"Received restaurant data: {data}")
        
        # Convert NumPy types to standard Python types
        def convert_to_python_type(obj):
            if isinstance(obj, np.integer):
                return int(obj)
            elif isinstance(obj, np.floating):
                return float(obj)
            elif isinstance(obj, np.ndarray):
                return obj.tolist()
            elif isinstance(obj, dict):
                return {k: convert_to_python_type(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [convert_to_python_type(v) for v in obj]
            return obj

        # Apply conversion to input data
        data = convert_to_python_type(data) 
        
        # Extract data from request
        current_route = data.get('route', [])
        arrival_times = data.get('arrivalTimes', [])
        departure_times = data.get('departureTimes', [])
        wait_times = data.get('waitTimes', [])
        restaurant = data.get('restaurant', {})
        
        # Extract marker and polyline info if available
        marker_id = restaurant.get('markerId')
        polyline_id = restaurant.get('polylineId')
        meal_type = restaurant.get('mealType')
        
        logging.info(f"Processing restaurant: {restaurant.get('name')} (Marker: {marker_id}, Polyline: {polyline_id}, Meal: {meal_type})")
        
        # Load place data
        place_data = load_json("data.json")
        df = pd.DataFrame(place_data).set_index("place_name")
        
        # Extract the start and end time from first and last elements
        start_time = departure_times[0]
        end_time = arrival_times[-1]  # Time when returning to hotel
        
        # Log initial route details before restaurant insertion
        log_route_details(
            current_route, 
            arrival_times, 
            departure_times, 
            wait_times, 
            "Route Before Restaurant Insertion"
        )
        
        # Insert restaurant into the route with multiple time window handling
        updated_route = insert_restaurant_into_route(
            current_route,
            arrival_times,
            departure_times,
            wait_times,
            restaurant,
            df,
            start_time,
            end_time
        )
        
        # Ensure all values are converted to standard Python types
        updated_route = convert_to_python_type(updated_route)
        
        return jsonify(updated_route)
        
    except Exception as e:
        logging.error(f"ERROR in update_route_with_restaurant: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e), "message": "Failed to update route with restaurant"}), 500

def insert_restaurant_into_route(route, arrival_times, departure_times, wait_times, restaurant, df, start_time, end_time):
    """
    Insert a restaurant into the route at the specified position and re-optimize the
    timings for all subsequent places. Handles multiple time windows for places.
    """
    try:
        # Validate and prepare input data
        restaurant_name = restaurant.get('name', 'Unknown Restaurant')
        before_index = int(restaurant.get('beforeIndex', 0))
        after_index = int(restaurant.get('afterIndex', 1))
        arrival_time_at_restaurant = float(restaurant.get('arrivalTime', 0))
        departure_time_from_restaurant = float(restaurant.get('departureTime', 0))
        total_additional_time = float(restaurant.get('totalAdditionalTime', 0))
        marker_id = restaurant.get('markerId')
        polyline_id = restaurant.get('polylineId')
        meal_type = restaurant.get('mealType')
        
        logging.info(f"Adding restaurant {restaurant_name} between {route[before_index]} and {route[after_index]}")
        logging.info(f"Restaurant metadata: Marker: {marker_id}, Polyline: {polyline_id}, Meal type: {meal_type}")
        
        # The rest of the function remains the same
        # ...
        
        # Create proper deep copies of input lists to avoid modifying originals
        new_route = route.copy()
        new_arrival_times = arrival_times.copy()
        if len(new_arrival_times) < len(new_route):
            new_arrival_times.extend([None] * (len(new_route) - len(new_arrival_times)))
        new_departure_times = departure_times.copy() + [None] * (len(route) - len(departure_times))
        new_wait_times = wait_times.copy() + [None] * (len(route) - len(wait_times))
        
        # Insert restaurant into the route at the correct position
        new_route.insert(after_index, restaurant_name)
        new_arrival_times[before_index] = arrival_time_at_restaurant
        
            
        new_departure_times[after_index] = departure_time_from_restaurant
        # Insert restaurant timing data directly
        # new_arrival_times.insert(before_index, arrival_time_at_restaurant)
        # # new_arrival_times[before_index] = arrival_time_at_restaurant
        # # del new_arrival_times[after_index]
        # # new_arrival_times.pop(after_index)
        # # new_departure_times[after_index] = departure_time_from_restaurant      
        # new_departure_times.insert(after_index, departure_time_from_restaurant)
        new_wait_times.insert(after_index, 0)  # No wait time at restaurant
        
        # Create travel times cache for efficiency
        travel_times_cache = {}
        
        # Update timings for all places after the restaurant
        for i in range(after_index+1, len(new_route)):
            # Get from place and to place
            from_place = new_route[i-1]
            to_place = new_route[i]
            
            # Calculate travel time from previous place to current place
            try:
                travel_time = get_travel_time(from_place, to_place, API_KEY, travel_times_cache)
            except Exception as e:
                logging.warning(f"Failed to get travel time from {from_place} to {to_place}. Using default 15 minutes.")
                travel_time = 15  # Default travel time
            
            # Calculate new arrival time based on previous place's departure time plus travel time
            new_arrival_time = new_departure_times[i-1] + travel_time
            print(f"arcival time : {new_arrival_time}")
            if i >= len(new_arrival_times):
                new_arrival_times.append(new_arrival_time)  
            else:
                new_arrival_times[i] = new_arrival_time
            
            # Check if this is the final hotel destination
            is_final_hotel = (i == len(new_route) - 1) and (to_place == new_route[0])
            
            if not is_final_hotel:
                # Get place data for opening and closing times
                if to_place in df.index:
                    place_data = df.loc[to_place]
                    
                    # Get all time windows for the place
                    time_windows = get_open_times(place_data)
                    
                    # Find the next available time window
                    wait_time, effective_arrival, window_index = find_next_available_time_window(new_arrival_time, time_windows)
                    
                    # Update wait time
                    new_wait_times[i] = wait_time
                    
                    # Standard visit duration (for attractions)
                    visit_duration = 100  # minutes
                    
                    # Get the selected time window
                    if window_index >= 0 and window_index < len(time_windows):
                        open_time, close_time = time_windows[window_index]
                        
                        # Calculate departure time (don't exceed closing time)
                        effective_arrival = new_arrival_time + wait_time
                        new_departure_times[i] = min(effective_arrival + visit_duration, close_time)
                    else:
                        # No suitable time window found, use default values
                        new_wait_times[i] = 0
                        new_departure_times[i] = new_arrival_time + visit_duration
                else:
                    # Default handling for places not in database
                    new_wait_times[i] = 0
                    new_departure_times[i] = new_arrival_time + 100  # Default visit duration
            else:
                # For the final destination (returning to hotel)
                new_wait_times[i] = 0
                new_departure_times[i] = new_departure_times[-1]  # No specific departure time needed
        del new_arrival_times[before_index+1]
        new_arrival_times.append(new_arrival_times[-1])
        # Log updated route details
        log_route_details(
            new_route, 
            new_arrival_times, 
            new_departure_times, 
            new_wait_times, 
            "Updated Route After Restaurant Insertion"
        )
        
        # Create detailed itinerary for the updated route
        itinerary = create_detailed_itinerary_with_time_windows(
            new_route, 
            new_arrival_times, 
            new_departure_times, 
            new_wait_times,
            df
        )
        
        return {
            "route": new_route,
            "arrival_times": new_arrival_times,
            "departure_times": new_departure_times,
            "wait_times": new_wait_times,
            "itinerary": itinerary,
            "warning": False
        }
        
    except Exception as e:
        logging.error(f"Error in insert_restaurant_into_route: {e}")
        import traceback
        traceback.print_exc()
        
        # Return a simple response with minimal information
        warning = f"⚠️ Could not add {restaurant.get('name', 'Restaurant')} to the route."
        
        return {
            "route": route,
            "arrival_times": arrival_times,
            "departure_times": departure_times, 
            "wait_times": wait_times,
            "itinerary": [warning],
            "warning": True
        }
    
    
def create_detailed_itinerary(route, arrival_times, departure_times, wait_times):
    """
    Create a comprehensive text itinerary from route and timing information.
    Handles float and int input times, provides detailed breakdown.
    """
    try:
        itinerary = []
        
        # Add introduction
        itinerary.append("\n📅 Updated Itinerary:\n")
        
        # Add hotel departure time (convert to integer)
        hotel = route[0]
        itinerary.append(f"🏨 {hotel} - Depart at {format_time(int(departure_times[0]))}\n")
        
        # Process each stop in the route
        for i in range(1, len(route)):
            current_place = route[i]
            
            # Convert times to integers
            prev_departure = int(departure_times[i-1])
            current_arrival = int(arrival_times[i])
            
            # Calculate travel time from previous place
            travel_time = current_arrival - prev_departure
            itinerary.append(f"🚗 Travelling to {current_place} ({travel_time} min)\n")
            
            # Add arrival information for all places except the final return to hotel
            if i < len(route) - 1:
                # Determine if this is a restaurant
                is_restaurant = "restaurant" in current_place.lower()
                
                # Use different emoji for restaurant vs attraction
                emoji = "🍽️" if is_restaurant else "🛍️"
                
                # Convert wait time to integer
                wait_time = int(wait_times[i]) if wait_times[i] is not None else 0
                
                # Calculate actual time spent at the location
                time_spent = int(departure_times[i]) - (int(arrival_times[i]) + wait_time)
                
                itinerary.extend([
                    f"{emoji} {current_place}\n",
                    f"- Arrive at {format_time(int(arrival_times[i]))}\n"
                ])
                
                # Add wait time if applicable
                if wait_time > 0:
                    itinerary.append(f"- Wait Time: {wait_time} min\n")
                
                # Add time spent at location
                itinerary.append(f"- Time Spent: {time_spent} min\n")
                
                # Add departure time
                itinerary.append(f"- Depart at {format_time(int(departure_times[i]))}\n")
            else:
                # Final return to hotel
                itinerary.append(f"🏨 {current_place} - Arrive at {format_time(int(arrival_times[i]))}\n")
        
        # Add summary
        places_visited = len(route) - 2  # Excluding hotel at start and end
        itinerary.append(f"\n📊 Summary:\n")
        itinerary.append(f"- Start Time: {format_time(int(departure_times[0]))}\n")
        itinerary.append(f"- End Time: {format_time(int(arrival_times[-1]))}\n")
        itinerary.append(f"- Places Visited: {places_visited}\n")
        
        # Calculate total waiting time - fix potential type issues
        total_wait_time = sum(int(wait) for wait in wait_times if wait is not None)
        if total_wait_time > 0:
            itinerary.append(f"- Total Wait Time: {total_wait_time} min\n")
        
        return itinerary
    
    except Exception as e:
        logging.error(f"Error in create_detailed_itinerary: {e}")
        import traceback
        traceback.print_exc()
        
        # Fallback itinerary in case of error
        return [
            "\n⚠️ Unable to generate detailed itinerary.\n",
            f"Error occurred while processing route with {len(route)} places.\n"
        ]


def log_route_details(route, arrival_times, departure_times, wait_times, title):
    """
    Log the details of a route including timing information in a consistent format.
    """
    # Ensure arrival_times and departure_times have the correct length
    
    arrival_times = [None] + arrival_times
    departure_times.append(None)

    logging.info(f"\n==================================================")
    logging.info(f"{title}")
    logging.info(f"==================================================")
    logging.info(f"\n🗺️ Route Overview:")
    
    for i, place in enumerate(route):
        logging.info(f"{i+1}. {place}")
    
    logging.info(f"\nhjghjkh⏰ Timing Details:")

    for i, place in enumerate(route):
        logging.info(f"{place}:")
        
        # Format arrival time if available
        if i < len(arrival_times):
            arrival_minutes = arrival_times[i]
            if arrival_minutes is not None:
                arrival_time = format_time(int(arrival_minutes))
                logging.info(f"  - Arrival Time: {arrival_time}")
            else:
                logging.info(f"  - Arrival Time: N/A")
        else:
            logging.info(f"  - Arrival Time: N/A")
        
        # Format departure time if available
        if i < len(departure_times):
            departure_minutes = departure_times[i]
            if departure_minutes is not None:
                departure_time = format_time(int(departure_minutes))
                logging.info(f"  - Departure Time: {departure_time}")
            else:
                logging.info(f"  - Departure Time: N/A")
        else:
            logging.info(f"  - Departure Time: N/A")
        
        # Format wait time if available
        if i < len(wait_times):
            wait_time = wait_times[i]
            if wait_time is not None:
                logging.info(f"  - Wait Time: {int(wait_time)} minutes")
            else:
                logging.info(f"  - Wait Time: N/A")
        else:
            logging.info(f"  - Wait Time: 0 minutes")
    
    logging.info(f"\n==================================================\n")


def optimize_with_time_constraint(route, arrival_times, departure_times, wait_times, df, start_time, end_time):
    """
    Optimize the route to satisfy the end time constraint by potentially dropping some places.
    
    This function implements a greedy algorithm that tries to remove places with the lowest
    priority (based on a scoring function) until the route can be completed by the end time.
    """
    try:
        # Make copies of the route and time lists to avoid modifying the originals
        optimized_route = route.copy()
        
        # Score each place (excluding start and end points which are the hotel)
        place_scores = []
        
        # Skip the start, end and the restaurant we just added
        restaurant_name = route[2] if len(route) > 2 else None
        
        for i in range(1, len(route) - 1):
            place = route[i]
            
            if place == route[0] or place == route[-1] or place == restaurant_name:
                # Skip hotel and restaurant
                continue
                
            # Calculate time saved if we remove this place
            time_saved = calculate_time_saved_by_removing(route, i, departure_times, arrival_times)
            
            # Higher score means higher priority to keep
            # Here we use a simple scoring based on position in the original route
            # Places earlier in the route are given higher priority
            priority_score = len(route) - i
            
            place_scores.append({
                "place": place,
                "index": i,
                "time_saved": time_saved,
                "priority_score": priority_score,
                "removal_value": time_saved / priority_score  # Higher value means better candidate for removal
            })
        
        # Sort places by removal value (descending)
        place_scores.sort(key=lambda x: x["removal_value"], reverse=True)
        
        # Try removing places one by one until we satisfy the time constraint
        final_arrival_time = arrival_times[-1]
        places_to_remove = []
        
        for place_info in place_scores:
            # If we're already within the time constraint, stop removing places
            if final_arrival_time <= end_time:
                break
                
            places_to_remove.append(place_info)
            
            # Calculate the new estimated final arrival time
            time_saved = sum(p["time_saved"] for p in places_to_remove)
            estimated_arrival_time = final_arrival_time - time_saved
            
            if estimated_arrival_time <= end_time:
                # We've removed enough places to satisfy the constraint
                break
        
        # If we can't satisfy the constraint even after removing all possible places
        if len(places_to_remove) == len(place_scores) and final_arrival_time - sum(p["time_saved"] for p in places_to_remove) > end_time:
            return None
        
        # Remove the selected places and recalculate the route
        # Sort indices in descending order to avoid invalidating indices when removing items
        indices_to_remove = sorted([p["index"] for p in places_to_remove], reverse=True)
        
        # Create a new route without the removed places
        new_route = route.copy()
        for idx in indices_to_remove:
            new_route.pop(idx)
        
        # Recalculate the entire itinerary with the new route
        cache = {}
        hotel = new_route[0]  # First and last places are the hotel
        
        route_list, total_wait_time, itinerary, new_arrival_times, new_departure_times, new_wait_times, early_finish = calculate_detailed_itinerary(
            new_route, df, API_KEY, start_time, end_time, cache
        )
        
        return {
            "route": route_list,
            "arrival_times": new_arrival_times,
            "departure_times": new_departure_times,
            "wait_times": new_wait_times,
            "itinerary": itinerary,
            "warning": True,
            "removed_places": [p["place"] for p in places_to_remove]
        }
    except Exception as e:
        logging.error(f"Error in optimize_with_time_constraint: {e}")
        return None
    
def calculate_time_saved_by_removing(route, index, departure_times, arrival_times):
    """
    Calculate the time saved by removing a place at a specific index from the route.
    """
    # Time spent at this place
    place_time = departure_times[index] - arrival_times[index]
    
    # Previous place in route
    prev_place = route[index - 1]
    
    # Next place in route
    next_place = route[index + 1]
    
    # Current place
    current_place = route[index]
    
    # Time to travel from previous place to current place
    travel_time_to_current = arrival_times[index] - departure_times[index - 1]
    
    # Time to travel from current place to next place
    travel_time_to_next = arrival_times[index + 1] - departure_times[index]
    
    # Create a distance cache
    travel_times_cache = {}
    
    # Calculate direct travel time from previous to next
    direct_travel_time = get_travel_time(prev_place, next_place, API_KEY, travel_times_cache)
    
    # Total time saved = time at place + original travel times - new direct travel time
    time_saved = place_time + travel_time_to_current + travel_time_to_next - direct_travel_time
    
    return time_saved

def create_itinerary(route, arrival_times, departure_times, wait_times):
    """
    Create a detailed text itinerary from route and timing information.
    """
    itinerary = []
    
    # Add introduction
    itinerary.append("\n📅 Updated Itinerary:\n")
    
    # Add hotel departure time
    hotel = route[0]
    itinerary.append(f"🏨 {hotel} - Depart at {format_time(int(departure_times[0]))}\n")
    
    # Process each stop in the route
    for i in range(1, len(route)):
        current_place = route[i]
        
        # Calculate travel time from previous place
        if i > 0:
            prev_departure = int(departure_times[i-1])
            current_arrival = int(arrival_times[i])
            travel_time = current_arrival - prev_departure
            itinerary.append(f"🚗 Travelling to {current_place} ({travel_time} min)\n")
        
        # Add arrival information
        if i < len(route) - 1:  # Not the final return to hotel
            # Check if this is a restaurant
            is_restaurant = "restaurant" in current_place.lower()
            
            # Use different emoji for restaurant vs attraction
            emoji = "🍽️" if is_restaurant else "🛍️"
            
            itinerary.append(
                f"{emoji} {current_place}\n"
                f"- Arrive at {format_time(int(arrival_times[i]))}\n"
            )
            
            # Add wait time if applicable
            wait_time = int(wait_times[i]) if wait_times[i] is not None else 0
            if wait_time > 0:
                itinerary.append(f"- Wait Time: {wait_time} min\n")
            
            # Calculate and add time spent
            time_spent = int(departure_times[i]) - (int(arrival_times[i]) + wait_time)
            itinerary.append(f"- Time Spent: {time_spent} min\n")
            
            # Add departure time
            itinerary.append(f"- Depart at {format_time(int(departure_times[i]))}\n")
        else:
            # Final return to hotel
            itinerary.append(f"🏨 {current_place} - Arrive at {format_time(int(arrival_times[i]))}\n")
    
    # Add summary
    places_visited = len(route) - 2  # Excluding hotel at start and end
    itinerary.append(f"\n📊 Summary:\n")
    itinerary.append(f"- Start Time: {format_time(int(departure_times[0]))}\n")
    itinerary.append(f"- End Time: {format_time(int(arrival_times[-1]))}\n")
    itinerary.append(f"- Places Visited: {places_visited}\n")
    
    # Calculate total waiting time - fix handling of None values
    total_wait_time = sum(int(wt) for wt in wait_times if wt is not None)
    if total_wait_time > 0:
        itinerary.append(f"- Total Wait Time: {total_wait_time} min\n")
    
    return itinerary

if __name__ == "__main__":
    app.run(debug=True)