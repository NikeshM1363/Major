import orjson  # Faster JSON parsing
import requests
import pandas as pd
import logging
from typing import List, Dict, Tuple, Any, Optional

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def load_json(file_path):
    """Load JSON file quickly using orjson."""
    try:
        with open(file_path, "rb") as file:
            return orjson.loads(file.read())
    except FileNotFoundError:
        logger.error(f"File not found: {file_path}")
        raise
    except orjson.JSONDecodeError:
        logger.error(f"Error decoding JSON from file: {file_path}")
        raise

def get_travel_time(origin, destination, api_key, cache):
    """Fetch travel time with caching to minimize API calls."""
    # Check cache first
    cache_key = (origin, destination)
    if cache_key in cache:
        return cache[cache_key]
    
    # If not in cache, make API call
    try:
        url = f"https://maps.googleapis.com/maps/api/distancematrix/json?origins={origin}&destinations={destination}&key={api_key}&units=metric"
        response = requests.get(url).json()
        
        # Extract travel time in minutes, handle potential API errors
        try:
            travel_time = response["rows"][0]["elements"][0]["duration"]["value"] // 60
        except (KeyError, IndexError):
            # Default to 15 minutes if API call fails
            logger.warning(f"Failed to get travel time for {origin} to {destination}. Using default 15 minutes.")
            travel_time = 15
        
        # Store in cache and return
        cache[cache_key] = travel_time
        return travel_time
    except Exception as e:
        logger.error(f"Unexpected error in get_travel_time: {e}")
        return 15  # Fallback default

def read_optimized_route():
    """Extracts place names from optimized_route.json."""
    try:
        data = load_json("optimized_route.json")
        return [entry["place_name"] for entry in data]
    except Exception as e:
        logger.error(f"Error reading optimized route: {e}")
        return []

def format_time(minutes):
    """Convert minutes from midnight to HH:MM AM/PM format."""
    hours, mins = divmod(minutes, 60)
    hours = int(hours) % 24  # Handle rollover to next day
    period = "AM" if hours < 12 else "PM"
    display_hours = hours if 0 < hours < 12 else 12 if hours == 0 or hours == 12 else hours - 12
    return f"{display_hours}:{int(mins):02d} {period}"

def format_wait_time(minutes):
    """Convert minutes to HH:MM format for wait time display."""
    hours = (minutes // 60) % 24
    mins = minutes % 60
    hours = hours if 1 <= hours <= 12 else abs(hours - 12)
    return f"{hours}:{mins:02d}"

def get_open_times(place_data) -> List[Tuple[int, int]]:
    """
    Extract all opening and closing time intervals for a place.
    
    Args:
        place_data: Data for a place containing opening and closing times
        
    Returns:
        List of tuples with (open_time, close_time) in minutes from midnight
    """
    try:
        # Check if multiple time windows are available
        if "open_times" in place_data and "close_times" in place_data:
            # Multiple time windows format
            open_times = place_data["open_times"] if isinstance(place_data["open_times"], list) else [place_data["open_times"]]
            close_times = place_data["close_times"] if isinstance(place_data["close_times"], list) else [place_data["close_times"]]
            
            # Ensure the lists have the same length
            if len(open_times) != len(close_times):
                logger.warning(f"Mismatched open_times and close_times for {place_data.name}. Using first entries.")
                return [(open_times[0], close_times[0])]
            
            # Pair open and close times
            time_windows = []
            for i in range(len(open_times)):
                open_time = open_times[i]
                close_time = close_times[i]
                
                # Adjust closing time if it's before opening time (crosses midnight)
                if close_time < open_time:
                    close_time += 24 * 60  # Add 24 hours in minutes
                
                time_windows.append((open_time, close_time))
            
            return sorted(time_windows)  # Sort by open time
        else:
            # Legacy single time window format
            open_time = place_data["open_time"]
            close_time = place_data["close_time"]
            
            # Adjust closing time if it's before opening time (crosses midnight)
            if close_time < open_time:
                close_time += 24 * 60  # Add 24 hours in minutes
                
            return [(open_time, close_time)]
    except Exception as e:
        logger.error(f"Error in get_open_times: {e}")
        # Default to full day if error occurs
        return [(0, 24 * 60)]  # Open 24 hours

def find_next_available_time_window(current_time: int, time_windows: List[Tuple[int, int]]) -> Tuple[int, int, int]:
    """
    Find the next available time window given the current time.
    
    Args:
        current_time: Current time in minutes from midnight
        time_windows: List of (open_time, close_time) tuples
        
    Returns:
        Tuple of (wait_time, effective_arrival_time, selected_window_index)
    """
    min_wait = float('inf')
    best_window_index = -1
    best_arrival_time = current_time
    
    for i, (open_time, close_time) in enumerate(time_windows):
        # Calculate wait time if needed
        if current_time < open_time:
            # Need to wait until opening
            wait_time = open_time - current_time
            effective_arrival = open_time
        elif current_time <= close_time:
            # Already within open hours
            wait_time = 0
            effective_arrival = current_time
        else:
            # After closing time, need to wait until next period
            continue
        
        # Choose the option with minimal waiting
        if wait_time < min_wait:
            min_wait = wait_time
            best_arrival_time = effective_arrival
            best_window_index = i
    
    if best_window_index == -1:
        # No suitable window found today, default to the earliest one tomorrow
        # Adding 24 hours (1440 minutes) to the first opening time
        open_time = time_windows[0][0]
        wait_time = (24 * 60) + open_time - current_time
        return wait_time, open_time + (24 * 60), 0
    
    return min_wait, best_arrival_time, best_window_index

def can_complete_visit_before_end(current_time, current_place, place, next_place, place_data, end_time, travel_times_cache, api_key, visit_duration=100):
    """
    Determine if a place can be visited and return to the next destination before end_time,
    taking into account multiple opening and closing times.
    """
    try:
        # Get all time windows for the place
        time_windows = get_open_times(place_data)
        
        # Calculate arrival time at the place
        travel_time_to_place = get_travel_time(current_place, place, api_key, travel_times_cache)
        arrival_time = current_time + travel_time_to_place
        
        # Find the next available time window
        wait_time, effective_arrival_time, window_index = find_next_available_time_window(arrival_time, time_windows)
        
        # If no valid window found or wait time is too long, skip this place
        if window_index == -1 or wait_time > 180:  # Skip if wait is over 3 hours
            return False, arrival_time, wait_time, arrival_time
        
        # Get the selected time window
        open_time, close_time = time_windows[window_index]
        
        # Calculate departure time after visit
        departure_time = effective_arrival_time + visit_duration
        
        # Check if the visit fits within the time window
        if departure_time > close_time:
            # Visit would exceed closing time
            return False, arrival_time, wait_time, arrival_time
        
        # Calculate return time to next destination
        travel_time_to_next = get_travel_time(place, next_place, api_key, travel_times_cache)
        return_time = departure_time + travel_time_to_next
        
        # Check if we can complete the visit and return before end_time
        can_visit_in_time = return_time <= end_time
        
        return can_visit_in_time, arrival_time, wait_time, departure_time
    except Exception as e:
        logger.error(f"Error in can_complete_visit_before_end: {e}")
        return False, current_time, 0, current_time

def score_place(place, current_place, current_time, place_data, df, api_key, travel_times_cache):
    """
    Score a place based on multiple factors to select the optimal next destination,
    considering multiple opening and closing time windows.
    """
    try:
        # Get all time windows for the place
        time_windows = get_open_times(place_data)
        
        # Calculate travel time to this place
        travel_time = get_travel_time(current_place, place, api_key, travel_times_cache)
        arrival_time = current_time + travel_time
        
        # Find the next available time window
        wait_time, effective_arrival, window_index = find_next_available_time_window(arrival_time, time_windows)
        
        # If no valid window found, heavily penalize
        if window_index == -1:
            return float('inf'), arrival_time, wait_time
        
        # Get the selected time window
        open_time, close_time = time_windows[window_index]
        
        # If place will be closed when we arrive and wait time is excessive, heavily penalize
        if wait_time > 180:  # More than 3 hours wait
            return float('inf'), arrival_time, wait_time
        
        # Calculate scores based on various factors
        travel_score = travel_time * 1.0  # Base travel time weight
        wait_score = wait_time * 1.5      # Penalize waiting more
        
        # Calculate urgency score - places that close soon are prioritized
        time_until_close = close_time - effective_arrival
        urgency_score = 0
        if time_until_close < 120:  # If less than 2 hours until closing
            urgency_score = -100 * (1 - time_until_close/120)  # Negative to prioritize
        
        # Bonus for places that are already open when we arrive
        open_now_bonus = -50 if wait_time == 0 else 0
        
        # Combined score (lower is better)
        total_score = travel_score + wait_score + urgency_score + open_now_bonus
        
        return total_score, arrival_time, wait_time
    except Exception as e:
        logger.error(f"Error in score_place: {e}")
        return float('inf'), current_time, 0

def time_constrained_optimizer(places, hotel, df, api_key, start_time, end_time):
    """
    Optimizes route using a greedy approach while ensuring the trip ends 
    before the specified end_time and maximizes the number of places visited.
    Handles multiple opening and closing time windows for each place.
    """
    try:
        # Initialize variables
        route = [hotel]                # Start at hotel
        current_place = hotel
        current_time = start_time
        unvisited = set(places)
        travel_times_cache = {}
        visit_duration = 100           # Minutes per place
        
        # Continue until all places are visited or no more can be visited within constraints
        while unvisited:
            best_next_place = None
            best_score = float('inf')  # Lower is better
            best_arrival_time = None
            best_wait_time = None
            best_departure_time = None
            
            for place in unvisited:
                # Get data for this place
                place_data = df.loc[place]
                
                # Check if we can visit this place and return to the next destination before end_time
                can_visit, arrival_time, wait_time, departure_time = can_complete_visit_before_end(
                    current_time, current_place, place, hotel, place_data, end_time, travel_times_cache, api_key, visit_duration
                )
                
                if can_visit:
                    # Score this place based on our criteria
                    score, _, _ = score_place(
                        place, current_place, current_time, place_data, df, api_key, travel_times_cache
                    )
                    
                    if score < best_score:
                        best_score = score
                        best_next_place = place
                        best_arrival_time = arrival_time
                        best_wait_time = wait_time
                        best_departure_time = departure_time
            
            # If we found a valid next place, add it to the route
            if best_next_place:
                route.append(best_next_place)
                unvisited.remove(best_next_place)
                
                # Update current time and place
                current_time = best_departure_time
                current_place = best_next_place
            else:
                # No more places can be visited within constraints
                break
        
        # Complete the route by returning to the hotel
        route.append(hotel)
        return route
    except Exception as e:
        logger.error(f"Error in time_constrained_optimizer: {e}")
        return [hotel]

def calculate_detailed_itinerary(route, df, api_key, start_time, end_time, cache):
    """
    Calculate detailed itinerary with accurate times, including only 
    places that can be visited within the end_time constraint.
    Handles multiple opening and closing time windows.
    """
    try:
        current_time = start_time
        total_wait_time = 0
        itinerary = []
        route_list = []
        arrival_times = []
        departure_times = []
        wait_times = []
        visit_duration = 100  # Standard visit time in minutes
        
        # Start at the hotel
        hotel = route[0]
        route_list.append(hotel)
        wait_times.append(0)
        
        # Add hotel departure to itinerary
        itinerary.append(f"\n🏨 {hotel}\n   - Depart at {format_time(current_time)}\n")
        departure_times.append(current_time)  # Add departure time for hotel
        
        # Process each leg of the journey
        for i in range(1, len(route) - 1):  # Skip the last return to hotel for now
            current_place = route[i-1]
            next_place = route[i]
            
            # Calculate travel time to next place
            travel_time = get_travel_time(current_place, next_place, api_key, cache)
            arrival_time = current_time + travel_time
            
            # Add travel section to itinerary
            itinerary.append(f"🚗 Travelling to {next_place} ({travel_time} min)\n")
            
            # Update current time to arrival time
            current_time = arrival_time
            
            # Skip if next place is not in our data
            if next_place not in df.index:
                continue
            
            # Get place details and all time windows
            place_data = df.loc[next_place]
            time_windows = get_open_times(place_data)
            
            # Find the next available time window
            wait_time, visit_start_time, window_index = find_next_available_time_window(current_time, time_windows)
            
            # If no valid window found or wait time is too long, skip this place
            if window_index == -1 or wait_time > 180:  # Skip if wait is over 3 hours
                itinerary.pop()  # Remove the travel section
                continue
            
            # Get the selected time window
            open_time, close_time = time_windows[window_index]
            
            # Calculate departure time after visit
            departure_time = visit_start_time + visit_duration
            
            # Check if the visit fits within the time window
            if departure_time > close_time:
                # Visit would exceed closing time, skip this place
                itinerary.pop()  # Remove the travel section
                continue
            
            # Check if we can still make it back to hotel by end_time
            time_to_hotel = get_travel_time(next_place, hotel, api_key, cache)
            return_time = departure_time + time_to_hotel
            
            if return_time <= end_time:
                total_wait_time += wait_time
                
                route_list.append(next_place)
                arrival_times.append(current_time)
                wait_times.append(wait_time)
                departure_times.append(departure_time)
                
                # Add time window information
                time_window_info = ""
                if len(time_windows) > 1:
                    window_num = window_index + 1
                    total_windows = len(time_windows)
                    time_window_info = f" (Window {window_num}/{total_windows}: {format_time(open_time)}-{format_time(close_time)})"
                
                itinerary.append(
                    f"🛍️ {next_place}{time_window_info}\n"
                    f"   - Arrive at {format_time(current_time)}\n"
                )
                
                if wait_time > 0:
                    itinerary.append(f"   - Wait Time: {wait_time} min (until {format_time(visit_start_time)})\n")
                
                itinerary.append(
                    f"   - Time Spent: {visit_duration} min\n"
                    f"   - Depart at {format_time(departure_time)}\n"
                )
                
                current_time = departure_time
            else:
                # Can't visit and return to hotel in time, skip and head back
                itinerary.pop()  # Remove the travel section
                break
        
        # Add final return to hotel
        final_place = route_list[-1] if route_list else hotel
        travel_time = get_travel_time(final_place, hotel, api_key, cache)
        arrival_time = current_time + travel_time
        
        # Only add return to hotel if we can make it by end_time
        if arrival_time <= end_time:
            itinerary.append(f"🚗 Returning to {hotel} ({travel_time} min)\n")
            itinerary.append(f"🏨 {hotel}\n   - Arrive at {format_time(arrival_time)}\n")
            route_list.append(hotel)
            arrival_times.append(arrival_time)
            wait_times.append(0)
        else:
            # Calculate the latest time we need to leave to get back by end_time
            latest_departure = end_time - travel_time
            itinerary.append(f"⚠️ To reach {hotel} by {format_time(end_time)}, leave by {format_time(latest_departure)}\n")
            itinerary.append(f"🚗 Returning to {hotel} ({travel_time} min)\n")
            itinerary.append(f"🏨 {hotel}\n   - Arrive at {format_time(end_time)}\n")
            route_list.append(hotel)
            arrival_times.append(end_time)
            wait_times.append(0)
        
        early_finish = end_time - arrival_time if arrival_time < end_time else 0
        
        return route_list, total_wait_time, itinerary, arrival_times, departure_times, wait_times, early_finish
    except Exception as e:
        logger.error(f"Error in calculate_detailed_itinerary: {e}")
        return [], 0, [], [], [], [], 0


def create_detailed_itinerary_with_time_windows(route, arrival_times, departure_times, wait_times, df):
    """
    Create a comprehensive text itinerary from route and timing information.
    Handles multiple time windows and provides detailed breakdown.
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
                
                # Check if place is in our database
                if current_place in df.index and not is_restaurant:
                    # Get time window information
                    place_data = df.loc[current_place]
                    time_windows = get_open_times(place_data)
                    
                    # Determine which time window we're using
                    arrival = current_arrival
                    effective_arrival = arrival + wait_time
                    window_used = None
                    
                    for idx, (open_time, close_time) in enumerate(time_windows):
                        if effective_arrival >= open_time and effective_arrival <= close_time:
                            window_used = (idx, open_time, close_time)
                            break
                    
                    # Add time window information if multiple windows exist
                    time_window_info = ""
                    if window_used and len(time_windows) > 1:
                        window_idx, open_time, close_time = window_used
                        window_num = window_idx + 1
                        total_windows = len(time_windows)
                        time_window_info = f" (Window {window_num}/{total_windows}: {format_time(open_time)}-{format_time(close_time)})"
                    
                    itinerary.extend([
                        f"{emoji} {current_place}{time_window_info}\n",
                        f"- Arrive at {format_time(int(arrival_times[i]))}\n"
                    ])
                else:
                    itinerary.extend([
                        f"{emoji} {current_place}\n",
                        f"- Arrive at {format_time(int(arrival_times[i]))}\n"
                    ])
                
                # Add wait time if applicable
                if wait_time > 0:
                    effective_time = int(arrival_times[i]) + wait_time
                    itinerary.append(f"- Wait Time: {wait_time} min (until {format_time(effective_time)})\n")
                
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
        
        # Calculate total waiting time
        total_wait_time = sum(int(wait) for wait in wait_times if wait is not None)
        if total_wait_time > 0:
            itinerary.append(f"- Total Wait Time: {total_wait_time} min\n")
        
        return itinerary
    
    except Exception as e:
        logging.error(f"Error in create_detailed_itinerary_with_time_windows: {e}")
        import traceback
        traceback.print_exc()
        
        # Fallback itinerary in case of error
        return [
            "\n⚠️ Unable to generate detailed itinerary.\n",
            f"Error occurred while processing route with {len(route)} places.\n"
        ]
    
    
def optimize_route_with_end_time(optimized_route, df, api_key, start_time, end_time):
    """
    Main optimization function that sequences places efficiently based on
    opening times, closing times, travel distances, with the constraint
    of returning to the hotel by the specified end_time.
    Handles multiple opening and closing time windows for each place.
    """
    try:
        hotel = optimized_route[0]
        places_to_visit = [p for p in optimized_route[1:-1] if p in df.index]
        
        # Validate end time is after start time
        if end_time <= start_time + 75:
            logger.error("End time must be at least 1hr 15min after start time")
            return [], 0, ["Error: End time must be at least 1hr 15min after start time"], [], [], [], 0
        
        # Optimize route with end time constraint
        optimal_route = time_constrained_optimizer(
            places_to_visit, hotel, df, api_key, start_time, end_time
        )
        
        # Calculate detailed itinerary
        route_list, total_wait_time, itinerary, arrival_times, departure_times, wait_times, early_finish = calculate_detailed_itinerary(
            optimal_route, df, api_key, start_time, end_time, {}
        )
        
        # Add summary statistics
        places_visited = len(route_list) - 2 if len(route_list) >= 2 else 0  # Exclude hotel at start and end
        places_skipped = len(places_to_visit) - places_visited
        
        summary = [
            f"\n📊 Trip Summary:\n",
            f"   - Start Time: {format_time(start_time)}\n",
            f"   - End Time: {format_time(arrival_times[-1])}\n",
            f"   - Places Visited: {places_visited} of {len(places_to_visit)}\n",
            f"   - Places Skipped: {places_skipped}\n",
            f"   - Total Wait Time: {total_wait_time} minutes\n"
        ]
        
        if early_finish > 0:
            summary.append(f"   - Finished {early_finish} minutes early\n")
        
        # Insert summary at the beginning of itinerary
        # itinerary = summary + itinerary
        
        # Logging for debugging
        logger.info(f"Optimal Route: {route_list}")
        logger.info(f"Arrival Times: {arrival_times}")
        logger.info(f"Departure Times: {departure_times}")
        logger.info(f"Wait Times: {wait_times}")
        
        return route_list, total_wait_time, itinerary, arrival_times, departure_times, wait_times, early_finish
    except Exception as e:
        logger.error(f"Unexpected error in optimize_route_with_end_time: {e}")
        return [], 0, [f"Unexpected error: {e}"], [], [], [], 0

def main():
    try:
        # Google Maps API key (consider moving this to a secure configuration)
        api_key = "AIzaSyDVI_HLPb1lYJg7HnL69ilqGc4l1AkzmcY"  # Replace with actual API key
        
        # Read optimized route
        optimized_route = read_optimized_route()
        if not optimized_route:
            logger.error("No optimized route found")
            return None
        
        # Load place data
        data = load_json("data.json")
        df = pd.DataFrame(data).set_index("place_name")
        
        # Get start and end times from user
        start_time = int(input("Enter start time in minutes from midnight (e.g., 480 for 8:00 AM): "))
        end_time = int(input("Enter end time in minutes from midnight (e.g., 1080 for 6:00 PM): "))
        
        # Optimize route
        result = optimize_route_with_end_time(
            optimized_route, df, api_key, start_time, end_time
        )
        
        # Print the itinerary
        print("\n".join(result[2]))
        
        # Return full results for potential further processing
        return {
            "route": result[0],
            "wait_time": result[1],
            "itinerary": result[2],
            "arrival_times": result[3],
            "departure_times": result[4],
            "wait_times": result[5],
            "early_finish": result[6]
        }
    except Exception as e:
        logger.error(f"Critical error in main function: {e}")
        return None

if __name__ == "__main__":
    main()