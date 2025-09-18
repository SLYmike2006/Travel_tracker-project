document.addEventListener('DOMContentLoaded', function() {
    const mapContainer = document.getElementById('mapid');
    if (!mapContainer) return; // Should always be here, but a good safe guard

    window.fetchAndDisplayStats = function () {
        fetch('/api/stats')
            .then(response => response.ok ? response.json() : Promise.reject('Failed to load stats.'))
            .then(stats => {
                document.getElementById('total-trips').textContent = stats.total_trips;
                document.getElementById('unique-countries').textContent = stats.unique_countries;
                document.getElementById('unique-continents').textContent = stats.unique_continents;
            })  
            .catch(error => console.error('Error fetching stats:', error));
    };
    const southWest = L.latLng(-85, -180);
    const northEast = L.latLng(85, 180);
    const bounds = L.latLngBounds(southWest, northEast);

    const map = L.map('mapid', {
        center: [20, 0],
        zoom: 2,
        maxBounds: bounds,
        maxBoundsViscosity: 1.0
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        minZoom: 2,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Call invalidateSize after a short delay to ensure the map container has the correct size
    setTimeout(function() {
        map.invalidateSize();
    }, 100);

    const latInput = document.getElementById('lat');
    const lngInput = document.getElementById('lng');
    const nameInput = document.getElementById('name');
    const searchInput = document.getElementById('location-search');

    let addPlaceMarker = null;

    function updateFormFields(latlng) {
        latInput.value = latlng.lat.toFixed(6);
        lngInput.value = latlng.lng.toFixed(6);
    }

    map.on('click', function(e) {
        const clickedLatLng = e.latlng;
        if (!addPlaceMarker) {
            addPlaceMarker = L.marker(clickedLatLng, { draggable: true }).addTo(map);
            addPlaceMarker.on('dragend', function(event) {
                const position = event.target.getLatLng();
                updateFormFields(position);
                map.panTo(position);
            });
        } else {
            addPlaceMarker.setLatLng(clickedLatLng);
        }
        updateFormFields(clickedLatLng);
        map.panTo(clickedLatLng);
    });

    document.getElementById('search-button').addEventListener('click', function() {
        const query = searchInput.value;
        if (query.trim() === '') return alert('Please enter a location.');

        fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`)
            .then(response => response.ok ? response.json() : Promise.reject('Network response was not ok.'))
            .then(data => {
                if (data.length > 0) {
                    const { lat, lon, display_name } = data[0];
                    const latlng = L.latLng(lat, lon);
                    map.setView(latlng, 13);
                    if (!addPlaceMarker) {
                        addPlaceMarker = L.marker(latlng, { draggable: true }).addTo(map);
                        addPlaceMarker.on('dragend', function(event) {
                            const position = event.target.getLatLng();
                            updateFormFields(position);
                            map.panTo(position);
                        });
                    } else {
                        addPlaceMarker.setLatLng(latlng);
                    }
                    updateFormFields(latlng);
                    if (!nameInput.value) {
                        nameInput.value = display_name.split(',')[0];
                    }
                } else {
                    alert('Location not found.');
                }
            })
            .catch(error => console.error('Geocoding Error:', error));
    });

    function createPopupContent(place) {
        let content = `<strong>${place.name}</strong>`;
        if (place.date) content += `<br><em>${place.date}</em>`;
        if (place.notes) content += `<br><p>${place.notes}</p>`;
        content += `<br><button class="edit-place-btn" data-id="${place.id}">Edit</button> | <button class="delete-place-btn" data-id="${place.id}">Delete</button>`;
        return content;
    }

    const markers = L.markerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: 60,
    });
    const markerReferences = {};
    const placesData = {};
    let editingPlaceId = null;

    function addSavedPlaceMarker(place) {
        placesData[place.id] = place;
        const marker = L.marker([place.lat, place.lng])
            .bindPopup(createPopupContent(place));
        markers.addLayer(marker);
        markerReferences[place.id] = marker;
    }

    fetch('/api/places')
    .then(response => response.ok ? response.json() : Promise.reject('Failed to load places.'))
    .then(places => {
        places.forEach(addSavedPlaceMarker);
        map.addLayer(markers);
    })
    .catch(error => console.error('Error fetching places:', error));

    fetchAndDisplayStats();


    const form = document.getElementById('add-place-form');
    const submitBtn = form.querySelector('button[type="submit"]');
    const cancelEditBtn = document.getElementById('cancel-edit');

    function enterEditMode(place) {
        editingPlaceId = place.id;
        nameInput.value = place.name;
        document.getElementById('date').value = place.date;
        document.getElementById('notes').value = place.notes;
        latInput.value = place.lat;
        lngInput.value = place.lng;

        submitBtn.textContent = 'Update Travel Log';
        cancelEditBtn.style.display = 'inline-block';
        form.scrollIntoView({ behavior: 'smooth' });
    }

    function exitEditMode() {
        editingPlaceId = null;
        form.reset();
        submitBtn.textContent = 'Add to My Travel Log';
        cancelEditBtn.style.display = 'none';
        latInput.value = '';
        lngInput.value = '';
    }

    cancelEditBtn.addEventListener('click', exitEditMode);

    form.addEventListener('submit', function(event) {
        event.preventDefault();
        const formData = {
            name: nameInput.value,
            date: document.getElementById('date').value,
            notes: document.getElementById('notes').value,
        };

        let url = '/api/places';
        let method = 'POST';

        if (editingPlaceId) {
            url = `/api/places/${editingPlaceId}`;
            method = 'PUT';
            formData.lat = latInput.value;
            formData.lng = lngInput.value;
        } else {
            formData.lat = latInput.value;
            formData.lng = lngInput.value;
        }

        fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData),
        })
        .then(response => response.json())
        .then(place => {
            if (place.error) {
                alert('Error: ' + place.error);
            } else {
                if (editingPlaceId) {
                    // Update existing marker
                    const marker = markerReferences[editingPlaceId];
                    placesData[editingPlaceId] = place;
                    marker.setPopupContent(createPopupContent(place));

                    const dashboardItem = document.getElementById(`place-${place.id}`);
                    if (dashboardItem) {
                        dashboardItem.textContent = `${place.name} (${place.lat}, ${place.lng})`;
                    }

                    exitEditMode();
                } else {
                    addSavedPlaceMarker(place);
                    if (addPlaceMarker) {
                        map.removeLayer(addPlaceMarker);
                        addPlaceMarker = null;
                    }
                    form.reset();
                }
                fetchAndDisplayStats();
            }
        });
    });

    let placeIdToDelete = null;

    document.addEventListener('click', function(e) {
        if (e.target && e.target.classList.contains('delete-place-btn')) {
            placeIdToDelete = e.target.dataset.id;
            document.getElementById('delete-modal').style.display = 'flex';
        } else if (e.target && e.target.classList.contains('edit-place-btn')) {
            const placeId = e.target.dataset.id;
            const place = placesData[placeId];
            if (place) {
                enterEditMode(place);
            }
        }
    });

    document.getElementById('zoom-out-btn').addEventListener('click', function() {
        map.setView([20, 0], 2);
    });

    document.getElementById('cancel-delete').addEventListener('click', () => {
        placeIdToDelete = null;
        document.getElementById('delete-modal').style.display = 'none';
    });

    document.getElementById('confirm-delete').addEventListener('click', () => {
        if (!placeIdToDelete) return;
        fetch(`/api/places/${placeIdToDelete}`, { method: 'DELETE' })
            .then(response => {
                if (response.ok) {
                    const markerToRemove = markerReferences[placeIdToDelete];
                    if (markerToRemove) {
                        map.removeLayer(markerToRemove);
                        delete markerReferences[placeIdToDelete];
                        delete placesData[placeIdToDelete];
                    }
                    fetchAndDisplayStats();
                } else {
                    alert('Failed to delete place.');
                }
            })
            .catch(error => console.error('Error deleting place:', error))
            .finally(() => {
                document.getElementById('delete-modal').style.display = 'none';
                placeIdToDelete = null;
            });
    });

    // Check for edit mode from URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const placeIdToEdit = urlParams.get('edit');

    if (placeIdToEdit) {
        const tryEnterEditMode = () => {
            if (Object.keys(placesData).length > 0) {
                const place = placesData[placeIdToEdit];
                if (place) {
                    enterEditMode(place);
                    // Also, pan the map to the location
                    map.setView([place.lat, place.lng], 13);
                } else {
                    console.warn(`Place with ID ${placeIdToEdit} not found for editing.`);
                }
            } else {
                // If placesData is not populated yet, try again shortly.
                setTimeout(tryEnterEditMode, 100);
            }
        };
        tryEnterEditMode();
    }
});
