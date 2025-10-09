from app import app, db, User, Place  

with app.app_context():
    db.create_all()

print("✅ Database initialized successfully.")