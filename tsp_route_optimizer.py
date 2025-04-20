import requests
import json
import numpy as np

def get_distance_matrix(places, api_key):
    """Fetch distance matrix for all places using Google Distance Matrix API."""
    origins = "|".join(places)
    destinations = "|".join(places)
    url = f"https://maps.googleapis.com/maps/api/distancematrix/json?origins={origins}&destinations={destinations}&key={api_key}&units=metric"
    
    response = requests.get(url)
    data = response.json()

    if data["status"] != "OK":
        raise Exception("Error fetching distance matrix from API")

    # Extract distance values (in km)
    dist_matrix = np.zeros((len(places), len(places)))
    for i, row in enumerate(data["rows"]):
        for j, element in enumerate(row["elements"]):
            if element["status"] == "OK":
                dist_matrix[i][j] = element["distance"]["value"] / 1000  # Convert meters to km
            else:
                dist_matrix[i][j] = float("inf")  # Assign infinite distance if not reachable

    return dist_matrix

def tsp_dynamic_programming(dist_matrix):
    """Solve TSP using Held-Karp DP algorithm (O(n² * 2ⁿ) complexity)."""
    n = len(dist_matrix)
    memo = {}

    def visit(mask, pos):
        """Recursively find shortest path covering all places."""
        if mask == (1 << n) - 1:  # All places visited
            return dist_matrix[pos][0]  # Return to start (hotel)
        
        if (mask, pos) in memo:
            return memo[(mask, pos)]
        
        min_cost = float("inf")
        for next_pos in range(n):
            if mask & (1 << next_pos) == 0:  # If next_pos is not visited
                new_cost = dist_matrix[pos][next_pos] + visit(mask | (1 << next_pos), next_pos)
                min_cost = min(min_cost, new_cost)

        memo[(mask, pos)] = min_cost
        return min_cost

    best_distance = visit(1, 0)  # Start from hotel
    return best_distance

def tsp_route_optimizer(hotel):
    """Optimize route using TSP Dynamic Programming & Google Distance Matrix API."""
    api_key = "AIzaSyDVI_HLPb1lYJg7HnL69ilqGc4l1AkzmcY"  # Replace with actual API key

    # Read places from JSON file
    with open("recommended_places.json", "r") as file:
        places_data = json.load(file)

    places = [place["place_name"] for place in places_data]
    # hotel = "Fairfield By Marriott Vadodara"  # Fixed hotel location

    # Include hotel at the start and end
    places = [hotel] + places + [hotel]

    # Generate optimized distance matrix
    dist_matrix = get_distance_matrix(places, api_key)

    # Solve TSP with Dynamic Programming
    best_distance = tsp_dynamic_programming(dist_matrix)

    # Save optimized route to JSON for Code 3
    optimized_route_data = [{"place_name": place} for place in places]

    with open("optimized_route.json", "w") as file:
        json.dump(optimized_route_data, file, indent=4)

    # print("Optimized route saved to 'optimized_route.json'")
    return places, best_distance

# Run optimizer
if __name__ == "__main__":
    hotel=input('Enter hotel name')
    tsp_route_optimizer(hotel)
