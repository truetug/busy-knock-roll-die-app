# Landing website

The landing at https://knock.busy.truetug.info is generated from the project README, the real app icon and screenshots in `docs/img`. It follows the BUSY Profit layout and styling, including the copyright badge and screenshot-based Open Graph/Twitter preview. Markdown tables are supported; documentation and release links point to GitHub. No app telemetry or usage statistics are added.

Build: `pip install -r website/requirements.txt` then `python website/build.py`. Preview `website/dist` with a local static HTTP server. Tests: `python -m pytest website/tests -q` (requires pytest).

The website workflow builds `ghcr.io/truetug/busy-knock-roll-die-app-website:latest`. The static runtime is Nginx on the private Docker `edge` network with no published ports; Caddy owns HTTPS. Deployment uses `/srv/knock-roll-die-app`, `website/docker-compose.yml` and the standard VPS autodeploy entrypoint. No app release or device installation is needed for website changes. Runtime `.env.deploy` stays outside Git.
