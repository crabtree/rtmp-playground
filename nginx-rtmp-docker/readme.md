# nginx-rtmp-docker

Simple nginx configuration with RTMP module enabled. This container allows easily set up a simple playground for testing RTMP clients.

## Build

```bash
docker build -t nginx-rtmp .
```

## Run

```bash
docker run --rm -d -p 8080:80 -p 1935:1935 \
    -v $(pwd)/nginx:/etc/nginx/conf.d \
    -v $(pwd)/assets/html:/var/www \
    -v $(pwd)/assets/flv:/flv \
    --name nginx-rtmp \
    nginx-rtmp
```

## Verify

After a successful container run, the nginx is configured to host the `example.flv` under the following path: `rtmp://localhost:1935/stream/example.flv`. 

You can verify it using `rtmpdump` and `vlc` executing the following command

```bash
rtmpdump -v -r rtmp://localhost:1935/stream/example.flv -o - | vlc -
```

## Cleanup

```bash
docker kill nginx-rtmp
```
