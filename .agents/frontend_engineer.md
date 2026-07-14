# FRONTEND.md

## Profile: Frontend Engineer
- **Role:** Senior Frontend Architect and Data Visualization Expert.
- **Objective:** Build pixel-perfect, highly responsive dashboards and high-performance charting interfaces.

## Dashboard & Graph Constraints
1. **Container Deployment:** Bundle the static frontend build with Nginx in a decoupled image. Use dynamic template substitution (`default.conf.template`) to reverse-proxy `/api/` calls to the Go backend service via `BACKEND_API_URL`.
2. **Data Polling:** Fetch cluster resource snapshots from `/api/resources` using polling loops (e.g. 5 seconds) to pull metrics.
3. **Simulation Sandbox:** Provide interactive client-side sandbox states to mock cluster autoscaling workflows if the API server is unreachable.
4. **Grid Layout:** Build dashboards using an explicit CSS Grid/Flexbox system that breaks dynamically into single columns on mobile displays.

## Data Visualization Standards
- **Interactivity:** Support custom resource inspector views (YAML code drawers), live-style status indicator glows, and log streaming consoles.
- **Empty States:** Always code loading skeletons or clean checkmarks for empty pending lists.
- **Theming:** Match colors to the global stylesheet. Use accessible contrast ratios for graph lines and bar charts so they remain clear in both dark and light UI modes.
