# Aaron, Tony, Ethan, Catherine's Hacks-Canada-2026 Project

**What does it *really* cost to live here?**

> Hack Canada 2026 | March 6–8, Waterloo

## The Problem

Rental listings only show rent. But for students in Waterloo-Kitchener, the *real* monthly cost includes commute time, grocery access, heating, and transit — costs that vary wildly by location. A $1,500 apartment can easily become $2,400/month when you factor everything in.

## What It Does

Project reveals the **true monthly cost** of living at any address in Waterloo-Kitchener through two core features:

### 1. Address Search → Detail Dashboard
Enter an address and get a full cost breakdown:
- **Hexagon radar chart** — visual snapshot across 6 cost dimensions
- **Rent trend** — 12-month price history for the area
- **Commute analysis** — drive vs. transit vs. bike to UW/WLU
- **Nearby essentials** — distance to groceries, transit stops, pharmacies
- **Estimated utilities** — heating/cooling cost based on climate + unit size
- **True Monthly Cost** — one number that tells the real story

### 2. Heatmap Explorer
An interactive map of Waterloo-Kitchener color-coded by true living cost. Red = expensive, green = affordable. Hover for a quick summary, click to dive into the full dashboard.

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | HTML/CSS/JS, Chart.js, Leaflet/Google Maps |
| APIs | Google Maps (commute), Google Places (nearby), OpenWeatherMap (climate) |
| Data | Apartments.com listings, CMHC rent reports, hardcoded utility models |
| Media | Cloudinary (listing images) |
| AI | Gemini (natural language search, cost summaries) |

## Sponsor Integration

- **Google** — Maps API, Places API, Gemini AI
- **Cloudinary** — image hosting and optimization for listing photos
- **GitHub** — issue tracking, PR workflow, CI/CD via Actions

## Team

| Name | Role |
|---|---|
| Aaron | Frontend, UI/UX, landing page |
| Tony | TBD |
| Ethan | TBD |
| Catherine | Pitch, presentation, UX research |

## License

MIT
