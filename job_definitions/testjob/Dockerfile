# SPDX-FileCopyrightText: 2022 Tim Cutts <tim@thecutts.org>
#
# SPDX-License-Identifier: MIT

FROM amazonlinux:latest
RUN yum -y install which unzip aws-cli
ADD wordcount.sh /usr/local/bin/wordcount.sh
WORKDIR /tmp
USER nobody
ENTRYPOINT ["/usr/local/bin/wordcount.sh"]