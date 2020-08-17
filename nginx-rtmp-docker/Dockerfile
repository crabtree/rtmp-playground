FROM alpine:3.12

RUN apk add --no-cache nginx nginx-mod-rtmp \
    && mkdir -p /run/nginx \
    && ln -sf /dev/stdout /var/log/nginx/access.log \
    && ln -sf /dev/stderr /var/log/nginx/error.log \
    && echo $'\n\
    rtmp { \n\
      include /etc/nginx/conf.d/*.rtmp; \n\
    }\n\
    ' >> /etc/nginx/nginx.conf

EXPOSE 80 1935
STOPSIGNAL SIGTERM

ENTRYPOINT ["nginx", "-g", "daemon off;"]