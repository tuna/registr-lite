import os
from flask import current_app
from eve import Eve
from eve.auth import BasicAuth as _BasicAuth
from eve_sqlalchemy import SQL
from eve_sqlalchemy.decorators import registerSchema
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy import func
from sqlalchemy import Column, Integer, String, DateTime, Enum

Base = declarative_base()


class EveMixin:
    '''
    Attributes used by Eve
    '''
    _id = Column(Integer, primary_key=True, autoincrement=True)
    _created = Column(DateTime, default=func.now())
    _updated = Column(DateTime, default=func.now(), onupdate=func.now())
    _etag = Column(String(40))


@registerSchema('candidate')
class Candidate(EveMixin, Base):
    __tablename__ = 'Candidates'

    name = Column(String(32), nullable=False)
    department = Column(String(128), nullable=True)
    stu_number = Column(String(16), nullable=True)
    phone = Column(String(16), nullable=True)
    email = Column(String(120), nullable=True)
    gender = Column(Enum('female', 'male'), nullable=True)
    team = Column(Enum('devOps', 'organizer', 'publicity', 'jiangyou'),
                  nullable=True)


class BasicAuth(_BasicAuth):
    def check_auth(self, username, password, allowed_roles, resource, method):
        return username == current_app.config['AUTH_USER'] and \
            password == current_app.config['AUTH_PASS']


def create_app():
    '''
    return a WSGI app
    '''

    # Default configuration suitable for development
    settings = dict(
        DEBUG=True,

        DOMAIN={
            'candidate': {**Candidate._eve_schema['candidate'], **{
                'public_methods': ['POST'],  # Creating is public
            }}
        },

        RESOURCE_METHODS=['GET', 'POST'],
        ITEM_METHODS=['GET', 'PUT', 'PATCH', 'DELETE'],

        # Database
        SQLALCHEMY_DATABASE_URI='sqlite:////tmp/registr.db',

        # Cross Domain
        X_DOMAINS='*',
        X_HEADERS=['Content-Type', 'Authorization'],
        X_EXPOSE_HEADERS=['X-Total-Count'],

        # Cache
        CACHE_CONTROL='no-cache, no-store, must-revalidate',

        # ISO 8601
        DATE_FORMAT="%Y-%m-%dT%H:%M:%S.%fZ",

        # Disable concurrency control
        IF_MATCH=False,
    )

    # retrieve configurations from environment variables
    # Following environ is read:
    # NO_DEBUG
    # DB_URI
    # AUTH_USER
    # AUTH_PASS
    if os.environ.get('NO_DEBUG'):
        settings['DEBUG'] = False
    db_uri = os.environ.get('DB_URI')
    if db_uri is not None:
        settings['SQLALCHEMY_DATABASE_URI'] = db_uri
    settings['AUTH_USER'] = os.environ.get('AUTH_USER', 'tunar')
    settings['AUTH_PASS'] = os.environ.get('AUTH_PASS', 'thiSiSsecreT')

    app = Eve(settings=settings, data=SQL, auth=BasicAuth)

    # bind SQLAlchemy
    app.data.driver.Model = Base
    Base.metadata.bind = app.data.driver.engine

    return app


app = create_app()


if __name__ == '__main__':
    from gevent.pywsgi import WSGIServer
    from gevent.pool import Pool
    # Concurrency of 10000
    Base.metadata.create_all()
    pool = Pool(10000)
    WSGIServer(('', 8080), app).serve_forever()
