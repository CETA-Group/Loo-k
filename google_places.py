import googlemaps

API_KEY = "AIzaSyAxxqwg4aSSnTnGcDSPSnHz2YqJTc9sidM"
gmaps = googlemaps.Client(key=API_KEY) #use this for commute cost, healthcare, recreation, noise, groceries

# Example: Text Search
results = gmaps.places(query="coffee shops in Waterloo, ON")

for place in results["results"]:
    print(place["name"], "-", place.get("formatted_address"))
