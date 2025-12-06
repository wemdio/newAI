from supabase import create_client, Client
from config import SUPABASE_URL, SUPABASE_KEY
from loguru import logger

class Database:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(Database, cls).__new__(cls)
            cls._instance.client = None
        return cls._instance

    def connect(self):
        if not self.client:
            try:
                self.client: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
                logger.info("Connected to Supabase")
            except Exception as e:
                logger.error(f"Failed to connect to Supabase: {e}")
                raise e
        return self.client

    def get_client(self) -> Client:
        if not self.client:
            return self.connect()
        return self.client

db = Database()

