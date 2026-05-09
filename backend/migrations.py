from sqlalchemy import text, inspect

def run_migrations(engine):
    """
    Check for missing columns and apply migrations automatically.
    This works for SQLite and Postgres (Railway).
    """
    try:
        inspector = inspect(engine)
        # Check if users table exists first
        if not inspector.has_table("users"):
            print("Users table does not exist yet. Skipping column migration (create_all will handle it).")
            return

        with engine.connect() as conn:
            # Check users table for new columns
            columns = [c['name'] for c in inspector.get_columns('users')]
            
            if 'current_points' not in columns:
                print("Migrating: Adding current_points to users")
                try:
                    conn.execute(text("ALTER TABLE users ADD COLUMN current_points INTEGER DEFAULT 0"))
                    conn.commit()
                    print("Added current_points column")
                except Exception as e:
                    print(f"Error adding current_points: {e}")
                    
            if 'total_points' not in columns:
                print("Migrating: Adding total_points to users")
                try:
                    conn.execute(text("ALTER TABLE users ADD COLUMN total_points INTEGER DEFAULT 0"))
                    conn.commit()
                    print("Added total_points column")
                except Exception as e:
                    print(f"Error adding total_points: {e}")
                    
            print("Migration checks completed.")
            
    except Exception as e:
        print(f"Migration failed: {e}")
