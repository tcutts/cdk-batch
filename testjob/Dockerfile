FROM amazonlinux:latest
# RUN yum -y install which unzip aws-cli
ADD job.sh /usr/local/bin/job.sh
WORKDIR /tmp
USER nobody
ENTRYPOINT ["/usr/local/bin/job.sh"]
