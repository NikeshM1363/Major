from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import pandas as pd
import logging
import numpy as np
from dotenv import load_dotenv
import os
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
    calculate_detailed_itinerary,
    optimize_with_time_constraint,
    calculate_time_saved_by_removing
)
load_dotenv()
# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('route_optimization.log')
    ]
)

# Initialize Flask app with CORS support
app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Google Maps API key
API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY")
if not API_KEY:
    logging.error("GOOGLE_MAPS_API_KEY environment variable not set")
    raise EnvironmentError("Missing GOOGLE_MAPS_API_KEY environment variable")

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
            logging.info(f"  - Arrival Time: {arrival_time}")
            logging.info(f"  - Departure Time: {departure_time}")
            logging.info(f"  - Wait Time: {wait_time} minutes")
        except Exception as e:
            logging.error(f"Error logging details for {route[i]}: {e}")

    logging.info("\n" + "="*50 + "\n")

def convert_to_minutes(time_str):
    """Convert HH:MM (24 hr) format to minutes from midnight."""
    hours, minutes = map(int, time_str.split(":"))
    return hours * 60 + minutes

# API ROUTE HANDLERS
@app.route("/api/health", methods=["GET"])
def health_check():
    """Simple health check endpoint to verify API availability."""
    return jsonify({"status": "ok", "message": "API is running"})

@app.route("/api/trip", methods=["POST"])
def create_trip():
    """
    Process travel recommendations and optimize a complete itinerary based on user preferences.
    Creates a new trip with recommended places, optimized route, and detailed timing.
    """
    try:
        data = request.json
        city = data.get("city")
        trip_type = data.get("trip_type")
        budget = float(data.get("budget"))
        hotel_name = data.get("hotel_name")
        start_time = data.get("start_time")
        end_time = data.get("end_time")
        
        # Convert times to minutes
        start_time_minutes = convert_to_minutes(start_time)
        end_time_minutes = convert_to_minutes(end_time)
        
        if end_time_minutes - start_time_minutes > 120:
            logging.info("Route generation started")
            
            # Step 1: Get recommended places
            try:
                recommendations_df = recommend_places(city, trip_type, budget)
                recommended_places = recommendations_df["place_name"].tolist()
                
                try:
                    recommendations_df.to_json("recommended_places.json", orient="records", indent=4)
                except Exception as e:
                    logging.error(f"Failed to save recommendations: {str(e)}")
            except Exception as e:
                logging.error(f"Failed to get recommendations: {str(e)}")
                return jsonify({
                    "success": False,
                    "error": "recommendation_error",
                    "message": f"Could not get recommendations: {str(e)}"
                }), 500

            # Step 2: Optimize route
            try:
                optimized_route, total_distance = tsp_route_optimizer(hotel_name)
            except Exception as e:
                logging.error(f"Failed to optimize route: {str(e)}")
                return jsonify({
                    "success": False,
                    "error": "route_optimization_error",
                    "message": f"Could not optimize route: {str(e)}"
                }), 500

            # Load place data
            try:
                data_json = load_json("data.json")
                df = pd.DataFrame(data_json).set_index("place_name")
            except FileNotFoundError:
                logging.error("Required data file 'data.json' not found")
                return jsonify({
                    "success": False,
                    "error": "data_not_found",
                    "message": "Required data file not found"
                }), 500
            except Exception as e:
                logging.error(f"Error loading data: {str(e)}")
                return jsonify({
                    "success": False,
                    "error": "data_load_error",
                    "message": f"Error loading data: {str(e)}"
                }), 500

            # Step 3: Time Optimization with multiple time windows
            try:
                (
                    best_route_list,
                    min_wait_time,
                    best_itinerary,
                    arrival_times_list,
                    departure_times_list,
                    wait_times_list,
                    early_finish
                ) = optimize_route_with_end_time(
                    optimized_route, df, API_KEY, start_time_minutes, end_time_minutes
                )
                
                # Convert to integers for JSON
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
                
                # Format time values for display
                formatted_arrival_times = [format_time(time) for time in arrival_times_list]
                formatted_departure_times = [format_time(time) for time in departure_times_list]
            except Exception as e:
                logging.error(f"Failed in time optimization: {str(e)}")
                return jsonify({
                    "success": False,
                    "error": "time_optimization_error",
                    "message": f"Could not optimize timings: {str(e)}"
                }), 500
            
            return jsonify({
                "success": True,
                "city": city,
                "trip_type": trip_type,
                "budget": budget,
                "hotel_name": hotel_name,
                "start_time": start_time,
                "end_time": end_time,
                "recommendations": recommended_places,
                "optimized_route": {
                    "route": best_route_list,
                    "total_distance": round(total_distance, 2),
                    "arrival_times": arrival_times_list,
                    "departure_times": departure_times_list,
                    "wait_times": wait_times_list,
                    "formatted_arrival_times": formatted_arrival_times,
                    "formatted_departure_times": formatted_departure_times,
                    "total_wait_time": min_wait_time,
                    "itinerary": best_itinerary,
                    "early_finish": early_finish
                }
            })
        else:
            return jsonify({
                "success": False,
                "error": "time_constraint",
                "message": "End time must be at least 120 minutes after start time."
            }), 400
    except Exception as e:
        logging.error(f"Error in create_trip: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": "server_error",
            "message": str(e)
        }), 500

@app.route("/api/recommendations", methods=["GET"])
def get_recommendations():
    """
    Return the list of recommended places for a city based on trip type and budget.
    A simpler endpoint that only provides recommendations without route optimization.
    """
    try:
        city = request.args.get("city")
        trip_type = request.args.get("trip_type")
        budget = float(request.args.get("budget", 100))
        
        if not city or not trip_type:
            return jsonify({
                "success": False,
                "error": "missing_parameters",
                "message": "City and trip_type parameters are required"
            }), 400
        
        try:    
            recommendations_df = recommend_places(city, trip_type, budget)
            recommended_places = recommendations_df.to_dict(orient="records")
        except Exception as e:
            logging.error(f"Failed to get recommendations: {str(e)}")
            return jsonify({
                "success": False,
                "error": "recommendation_error",
                "message": f"Could not get recommendations: {str(e)}"
            }), 500
        
        return jsonify({
            "success": True,
            "city": city,
            "trip_type": trip_type,
            "budget": budget,
            "recommendations": recommended_places
        })
    except Exception as e:
        logging.error(f"Error in get_recommendations: {str(e)}")
        return jsonify({
            "success": False,
            "error": "server_error",
            "message": str(e)
        }), 500

@app.route("/api/route", methods=["POST"])
def optimize_route():
    """
    Optimize a route based on given hotel and time constraints.
    This endpoint is focused only on route optimization without the recommendation step.
    """
    try:
        data = request.json
        hotel_name = data.get("hotel_name")
        start_time = data.get("start_time")
        end_time = data.get("end_time")
        
        if not hotel_name or not start_time or not end_time:
            return jsonify({
                "success": False,
                "error": "missing_parameters",
                "message": "hotel_name, start_time, and end_time are required"
            }), 400
        
        # Convert times to minutes
        start_time_minutes = convert_to_minutes(start_time)
        end_time_minutes = convert_to_minutes(end_time)
        
        # Get optimized route
        try:
            optimized_route, total_distance = tsp_route_optimizer(hotel_name)
        except Exception as e:
            logging.error(f"Failed to optimize route: {str(e)}")
            return jsonify({
                "success": False,
                "error": "route_optimization_error",
                "message": f"Could not optimize route: {str(e)}"
            }), 500
        
        # Load place data
        try:
            data_json = load_json("data.json")
            df = pd.DataFrame(data_json).set_index("place_name")
        except FileNotFoundError:
            logging.error("Required data file 'data.json' not found")
            return jsonify({
                "success": False,
                "error": "data_not_found",
                "message": "Required data file not found"
            }), 500
        except Exception as e:
            logging.error(f"Error loading data: {str(e)}")
            return jsonify({
                "success": False,
                "error": "data_load_error",
                "message": f"Error loading data: {str(e)}"
            }), 500
        
        # Time optimization
        try:
            (
                best_route_list,
                min_wait_time,
                best_itinerary,
                arrival_times_list,
                departure_times_list,
                wait_times_list,
                early_finish
            ) = optimize_route_with_end_time(
                optimized_route, df, API_KEY, start_time_minutes, end_time_minutes
            )
            
            # Convert to integers for JSON
            arrival_times_list = [int(time) for time in arrival_times_list]
            wait_times_list = [int(wait) for wait in wait_times_list]
            departure_times_list = [int(depart) for depart in departure_times_list]
        except Exception as e:
            logging.error(f"Failed in time optimization: {str(e)}")
            return jsonify({
                "success": False,
                "error": "time_optimization_error",
                "message": f"Could not optimize timings: {str(e)}"
            }), 500
        
        return jsonify({
            "success": True,
            "hotel_name": hotel_name,
            "route": best_route_list,
            "total_distance": round(total_distance, 2),
            "arrival_times": arrival_times_list,
            "departure_times": departure_times_list,
            "wait_times": wait_times_list,
            "total_wait_time": min_wait_time,
            "itinerary": best_itinerary,
            "early_finish": early_finish
        })
    except Exception as e:
        logging.error(f"Error in optimize_route: {str(e)}")
        return jsonify({
            "success": False,
            "error": "server_error",
            "message": str(e)
        }), 500

@app.route("/api/route/update", methods=["POST"])
def update_route_with_restaurant():
    """
    Update an existing route by adding a restaurant at the optimal position.
    Handles multiple time windows for places and recalculates timing details.
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
        
        if not current_route or not restaurant:
            return jsonify({
                "success": False,
                "error": "missing_parameters",
                "message": "Route and restaurant details are required"
            }), 400
        
        # Extract marker and polyline info if available
        marker_id = restaurant.get('markerId')
        polyline_id = restaurant.get('polylineId')
        meal_type = restaurant.get('mealType')
        
        logging.info(f"Processing restaurant: {restaurant.get('name')} (Marker: {marker_id}, Polyline: {polyline_id}, Meal: {meal_type})")
        
        # Load place data
        try:
            place_data = load_json("data.json")
            df = pd.DataFrame(place_data).set_index("place_name")
        except FileNotFoundError:
            logging.error("Required data file 'data.json' not found")
            return jsonify({
                "success": False,
                "error": "data_not_found",
                "message": "Required data file not found"
            }), 500
        except Exception as e:
            logging.error(f"Error loading data: {str(e)}")
            return jsonify({
                "success": False,
                "error": "data_load_error",
                "message": f"Error loading data: {str(e)}"
            }), 500
        
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
        try:
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
        except Exception as e:
            logging.error(f"Failed to insert restaurant: {str(e)}")
            return jsonify({
                "success": False,
                "error": "restaurant_insertion_error",
                "message": f"Could not insert restaurant: {str(e)}"
            }), 500
        
        return jsonify(updated_route)
        
    except Exception as e:
        logging.error(f"ERROR in update_route_with_restaurant: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": "server_error",
            "message": str(e)
        }), 500

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
            "success": True,
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
            "success": False,
            "route": route,
            "arrival_times": arrival_times,
            "departure_times": departure_times, 
            "wait_times": wait_times,
            "itinerary": [warning],
            "warning": True,
            "error": str(e)
        }

@app.route("/api/optimize-time", methods=["POST"])
def optimize_time_constraint():
    """
    Optimize a route to meet time constraints by potentially removing less important places.
    Used when the original route would exceed the available time window.
    """
    try:
        data = request.json
        route = data.get("route", [])
        arrival_times = data.get("arrival_times", [])
        departure_times = data.get("departure_times", [])
        wait_times = data.get("wait_times", [])
        start_time = data.get("start_time", 0)
        end_time = data.get("end_time", 0)
        
        if not route or not arrival_times or not departure_times or not wait_times:
            return jsonify({
                "success": False,
                "error": "missing_parameters",
                "message": "Route and timing details are required"
            }), 400
        
        # Load place data
        try:
            place_data = load_json("data.json")
            df = pd.DataFrame(place_data).set_index("place_name")
        except FileNotFoundError:
            logging.error("Required data file 'data.json' not found")
            return jsonify({
                "success": False,
                "error": "data_not_found",
                "message": "Required data file not found"
            }), 500
        except Exception as e:
            logging.error(f"Error loading data: {str(e)}")
            return jsonify({
                "success": False,
                "error": "data_load_error",
                "message": f"Error loading data: {str(e)}"
            }), 500
        
        result = optimize_with_time_constraint(
            route, 
            arrival_times, 
            departure_times, 
            wait_times, 
            df, 
            start_time, 
            end_time
        )
        
        if result:
            return jsonify({
                "success": True,
                "optimized_route": result
            })
        else:
            return jsonify({
                "success": False,
                "error": "optimization_failed",
                "message": "Could not optimize route to meet time constraints"
            }), 400
            
    except Exception as e:
        logging.error(f"Error in optimize_time_constraint: {str(e)}")
        return jsonify({
            "success": False,
            "error": "server_error",
            "message": str(e)
        }), 500

if __name__ == "__main__":
    app.run(debug=True)