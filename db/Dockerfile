FROM postgres:15
RUN apt-get update && apt-get -y install postgresql-15-cron && apt-get clean
CMD ["postgres", "-c", "shared_preload_libraries=pg_cron", "-c", "cron.database_name=appdb"]
