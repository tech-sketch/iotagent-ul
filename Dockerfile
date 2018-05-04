FROM node:8.11-alpine

MAINTAINER Nobuyuki Matsui <nobuyuki.matsui@gmail.com>

COPY . /opt/iotagent-ul
WORKDIR /opt/iotagent-ul

RUN npm install --production

EXPOSE 4041
EXPOSE 7896
ENTRYPOINT ["bin/iotagent-ul", "config.js"]
