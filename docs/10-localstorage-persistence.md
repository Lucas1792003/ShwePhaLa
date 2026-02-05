# LocalStorage Persistence

Data is persisted under the localStorage key `shwephala-db`.

On first load:
- `seedDbIfEmpty` writes `seedData` into localStorage.
- Zustand reads from the same key to hydrate app state.

Clearing localStorage resets the app to seed data.
