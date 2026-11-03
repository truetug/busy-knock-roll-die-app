FROM python:3.13-slim AS build
WORKDIR /build
COPY website/requirements.txt /build/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY README.md /build/README.md
COPY docs/img /build/docs/img
COPY src/appmeta/icon_front_8x8.png /build/src/appmeta/icon_front_8x8.png
COPY website /build/website
RUN python website/build.py

FROM nginx:stable-alpine
COPY --from=build /build/website/dist /usr/share/nginx/html
