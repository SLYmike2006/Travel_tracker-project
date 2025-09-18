import os
from flask import Flask, render_template, request, jsonify, flash, redirect, url_for
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
import reverse_geocoder as rg
from pycountry_convert import country_alpha2_to_continent_code
import recommendations

# --- App & DB Configuration ---
app = Flask(__name__)
# IMPORTANT: This secret key should be changed for production
app.config['SECRET_KEY'] = 'a_super_secret_key_that_should_be_changed'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///travel_tracker.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
bcrypt = Bcrypt(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'  # Redirect to login page if user is not authenticated
login_manager.login_message_category = 'info'

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# --- Database Models ---
class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(150), unique=True, nullable=False)
    password = db.Column(db.String(60), nullable=False)
    places = db.relationship('Place', backref='author', lazy=True)

class Place(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    lat = db.Column(db.Float, nullable=False)
    lng = db.Column(db.Float, nullable=False)
    date = db.Column(db.String(20))
    notes = db.Column(db.Text)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

# --- Main Route ---
@app.route('/')
@login_required
def index():
    return render_template('index.html')

@app.route('/logs')
@login_required
def logs():
    places = Place.query.filter_by(user_id=current_user.id).order_by(Place.date.desc()).all()
    return render_template('logs.html', title='My Travel Logs', places=places)

@app.route('/recommendations')
@login_required
def recommendations_page():
    return render_template('recommendations.html')

# --- API Routes ---
@app.route('/api/places', methods=['GET'])
@login_required
def get_places():
    places = Place.query.filter_by(user_id=current_user.id).all()
    places_list = []
    for place in places:
        places_list.append({
            'id': place.id,
            'name': place.name,
            'lat': place.lat,
            'lng': place.lng,
            'date': place.date,
            'notes': place.notes
        })
    return jsonify(places_list)

@app.route('/api/places', methods=['POST'])
@login_required
def add_place():
    data = request.get_json()
    if not data or 'name' not in data or 'lat' not in data or 'lng' not in data:
        return jsonify({"error": "Invalid data. 'name', 'lat', and 'lng' are required."}), 400

    new_place = Place(
        name=data['name'],
        lat=float(data['lat']),
        lng=float(data['lng']),
        date=data.get('date', ''),
        notes=data.get('notes', ''),
        author=current_user
    )
    db.session.add(new_place)
    db.session.commit()

    return jsonify({
        'id': new_place.id,
        'name': new_place.name,
        'lat': new_place.lat,
        'lng': new_place.lng,
        'date': new_place.date,
        'notes': new_place.notes
    }), 201

@app.route('/api/places/<int:place_id>', methods=['PUT'])
@login_required
def update_place(place_id):
    place = Place.query.get_or_404(place_id)
    if place.author != current_user:
        return jsonify({"error": "Unauthorized"}), 403

    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid data"}), 400

    place.name = data.get('name', place.name)
    place.date = data.get('date', place.date)
    place.notes = data.get('notes', place.notes)

    db.session.commit()

    return jsonify({
        'id': place.id,
        'name': place.name,
        'lat': place.lat,
        'lng': place.lng,
        'date': place.date,
        'notes': place.notes
    })


@app.route('/api/places/<int:place_id>', methods=['DELETE'])
@login_required
def delete_place(place_id):
    place = Place.query.get_or_404(place_id)
    if place.author != current_user:
        return jsonify({"error": "Unauthorized"}), 403
    db.session.delete(place)
    db.session.commit()
    return jsonify({"message": "Place deleted"}), 200

@app.route('/api/stats', methods=['GET'])
@login_required
def get_stats():
    places = Place.query.filter_by(user_id=current_user.id).all()

    total_trips = len(places)

    if not places:
        return jsonify({
            'total_trips': 0,
            'unique_countries': 0,
            'unique_continents': 0,
            'countries_visited': [],
            'continents_visited': []
        })

    coords = [(place.lat, place.lng) for place in places]
    results = rg.search(coords)

    countries = set()
    continents = set()

    for result in results:
        country_code = result.get('cc')
        if country_code:
            countries.add(country_code)
            try:
                continent_code = country_alpha2_to_continent_code(country_code)
                continents.add(continent_code)
            except KeyError:
                # Handle cases where the country code is not found in pycountry_convert
                pass

    return jsonify({
        'total_trips': total_trips,
        'unique_countries': len(countries),
        'unique_continents': len(continents),
        'countries_visited': sorted(list(countries)),
        'continents_visited': sorted(list(continents))
    })

@app.route('/api/recommendations', methods=['GET'])
@login_required
def get_recommendations():
    user_places = Place.query.filter_by(user_id=current_user.id).all()
    all_places = Place.query.all()

    # Get recommendations from both models
    content_recs = recommendations.get_content_based_recommendations(user_places, top_n=10)
    collab_recs = recommendations.get_collaborative_filtering_recommendations(current_user.id, all_places, top_n=10)

    # --- Hybrid Approach: Combine and de-duplicate ---
    final_recs = []
    seen_cities = set()

    # Add collaborative filtering recs first if available
    for rec in collab_recs:
        if rec['name'].lower() not in seen_cities:
            final_recs.append(rec)
            seen_cities.add(rec['name'].lower())
    
    # Then, add content-based recs
    for rec in content_recs:
        if len(final_recs) >= 10:
            break
        if rec['name'].lower() not in seen_cities:
            final_recs.append(rec)
            seen_cities.add(rec['name'].lower())

    # If still not enough recommendations, fill with popular places
    if len(final_recs) < 10:
        popular_recs = recommendations.CITIES_DATA.nlargest(20, 'population').to_dict('records')
        for rec in popular_recs:
            if len(final_recs) >= 10:
                break
            if rec['name'].lower() not in seen_cities:
                final_recs.append(rec)
                seen_cities.add(rec['name'].lower())
    return jsonify(final_recs)

# --- Authentication Routes ---
@app.route("/register", methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    if request.method == 'POST':
        hashed_password = bcrypt.generate_password_hash(request.form.get('password')).decode('utf-8')
        user = User(username=request.form.get('username'), password=hashed_password)
        db.session.add(user)
        db.session.commit()
        flash('Your account has been created! You are now able to log in', 'success')
        return redirect(url_for('login'))
    return render_template('register.html')


@app.route("/login", methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    if request.method == 'POST':
        user = User.query.filter_by(username=request.form.get('username')).first()
        if user and bcrypt.check_password_hash(user.password, request.form.get('password')):
            login_user(user, remember=True)
            next_page = request.args.get('next')
            return redirect(next_page) if next_page else redirect(url_for('index'))
        else:
            flash('Login Unsuccessful. Please check username and password', 'danger')
    return render_template('login.html')


@app.route("/logout")
def logout():
    logout_user()
    return redirect(url_for('index'))



@app.route('/api/stats')
@login_required
def stats():
    places = Place.query.filter_by(user_id=current_user.id).all()
    total_trips = len(places)

    import reverse_geocoder as rg
    from pycountry_convert import country_alpha2_to_continent_code

    countries = set()
    continents = set()

    for place in places:
        location = rg.search((place.lat, place.lng))[0]
        country_code = location['cc']
        countries.add(country_code)
        try:
            continents.add(country_alpha2_to_continent_code(country_code))
        except:
            pass

    return jsonify({
        'total_trips': total_trips,
        'unique_countries': len(countries),
        'unique_continents': len(continents),
    })


if __name__ == '__main__':
    app.run(debug=True, port=5001)
