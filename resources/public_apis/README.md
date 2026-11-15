# Vetted Public APIs Directory

> Maintained from: [GandhamRajaReddy/public-apis](https://github.com/GandhamRajaReddy/public-apis)

When building applications that need real-world external data (geocoding, weather, exchange rates, or mock data), use this curated catalog rather than integrating unverified third-party services that require complex credit card setups or introduce security vulnerabilities.

## How to Integrate in Projects
1. Consult `resources/public_apis/vetted_apis.json` for endpoints, CORS availability, and authentication headers.
2. Ensure network requests are wrapped with timeouts and error handling:
```typescript
export async function getCoordinates(query: string) {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json`, {
    headers: { 'User-Agent': 'ASEF-Application/1.0' }
  });
  if (!res.ok) throw new Error('Geocoding service unavailable');
  return res.json();
}
```
3. Never expose client-side unauthenticated scraping in production; route external API calls through backend proxy handlers.
