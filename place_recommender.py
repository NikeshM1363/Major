import pandas as pd
import numpy as np
import json

# Load data from JSON instead of CSV
with open("data.json", "r") as file:
    data = json.load(file)

df = pd.DataFrame(data)  # Convert JSON to DataFrame

def recommend_places(city, user_type, user_budget):
    """Recommend places based on user input, filtering by city."""

    # Filter data for the selected city
    df_filtered = df[df["city"].str.lower() == city.lower()].copy()

    # Handle case where no places exist for the selected city
    if df_filtered.empty:
        print(f"⚠️ No places found in {city}.")
        return pd.DataFrame()

    # Ensure numeric values
    df_filtered["avg_cost_per_person"] = pd.to_numeric(df_filtered["avg_cost_per_person"], errors="coerce")
    df_filtered["number_of_ratings"] = pd.to_numeric(df_filtered["number_of_ratings"], errors="coerce")

    # Vectorized Score Calculation
    rating_score = df_filtered["google_ratings"] * 3
    cost_score = np.where(
        df_filtered["avg_cost_per_person"] > user_budget, 
        0, 
        ((user_budget - df_filtered["avg_cost_per_person"]) / user_budget) * 10
    )
    rating_count_score = (df_filtered["number_of_ratings"] / 1000) * 3
    restaurant_bonus = np.where(df_filtered["type_of_place"] == "Food", 100, 0)
    type_match_bonus = np.where(df_filtered["type_of_place"] == user_type, 200, 0)

    # Compute final scores
    df_filtered["score"] = rating_score + cost_score + rating_count_score + restaurant_bonus + type_match_bonus

    # Sort only once and select top places
    df_sorted = df_filtered.nlargest(25, "score")  # Take the top 10 highest scores

    # Select top 5 places of the given type
    top_places = df_sorted[df_sorted["type_of_place"] == user_type].head(8)

    # Select top 2 food places (if trip type is not food)
    # food_places = df_sorted[df_sorted["type_of_place"] == "Food"].head(2) if user_type != "Food" else pd.DataFrame()
    # Merge results
    recommended_places = top_places

    # Handle case where no matching places are found
    if recommended_places.empty:
        print(f"⚠️ No places found for trip type '{user_type}' in {city}. Showing top-rated places instead.")
        recommended_places = df_sorted.head(8)  # Fallback: Top 5 rated places

    # Select relevant columns
    return recommended_places[["place_name", "score", "google_ratings", "number_of_ratings", "avg_cost_per_person", "type_of_place"]]

def main():
    """Main program logic."""   
    print("Welcome to the Trip Recommender!")
    city = input("Enter the city (e.g., Vadodara, Ahmedabad): ")
    user_type = input("Enter the type of trip (e.g., Sightseeing, Food, Shopping): ")
    user_budget = float(input("Enter your budget per person (in currency units): "))

    recommended = recommend_places(city, user_type, user_budget)

    if not recommended.empty:
        # Convert DataFrame to JSON format
        recommended_json = recommended.to_json(orient="records", indent=4)

        # Save to a JSON file
        with open("recommended_places.json", "w") as file:
            file.write(recommended_json)

        print("\nRecommended Places saved to 'recommended_places.json':")
        print(recommended_json)
    else:
        print("\n⚠️ No valid recommendations available.")

if __name__ == "__main__":
    main()
