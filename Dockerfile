FROM python:3.5

RUN mkdir /data/
COPY requirements.txt /data/

WORKDIR /data/
RUN pip3 install --upgrade pip setuptools && \
    pip3 install -r /data/requirements.txt

COPY registr.py /data/

CMD python registr.py
