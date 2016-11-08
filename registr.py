from eve import Eve
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
    team = Column(Enum('DevOps', 'Organizer', 'Publicity', 'Jiangyou'),
                  nullable=True)


def create_app():
    '''
    return a WSGI app
    '''

    # TODO: retrieve configuration from environment variables
    settings = dict(
        # For development
        DEBUG=True,

        DOMAIN={
            'candidate': Candidate._eve_schema['candidate']
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

    app = Eve(settings=settings, data=SQL)

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
