# registr-lite

A lightweight registr with only a bare RESTful API.

## Requirements

* python-eve
* sqlalchemy

## Howto

* Run:

```
~> git clone https://github.com/tuna/registr-lite.git
~> cd registr-lite
~> virtualenv venv
~> ./venv/bin/pip install -r requirements.txt
~> ./venv/bin/python registr.py
```

* Use:

```
~> http localhost:8080/candidate name='tunar'
~> http -a tunar:thiSiSsecreT localhost:8080/candidate
```

That's all.
