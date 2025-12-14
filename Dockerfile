FROM node:22-bullseye

RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Create cache directory for node-gyp with proper permissions
RUN mkdir -p /tmp/.cache/node-gyp && chmod -R 777 /tmp/.cache

ENV npm_config_cache=/tmp/.cache

WORKDIR /app

CMD ["/bin/bash"]
