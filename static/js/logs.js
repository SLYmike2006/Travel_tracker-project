document.addEventListener('DOMContentLoaded', function() {
    let placeIdToDelete = null;
    const deleteModal = document.getElementById('delete-modal');
    const confirmDeleteBtn = document.getElementById('confirm-delete');
    const cancelDeleteBtn = document.getElementById('cancel-delete');

    const logsContainer = document.querySelector('.logs-container');
    if (!logsContainer) return;

    logsContainer.addEventListener('click', function(e) {
        if (e.target && e.target.classList.contains('delete-place-btn')) {
            placeIdToDelete = e.target.dataset.id;
            deleteModal.style.display = 'flex';
        }
    });

    cancelDeleteBtn.addEventListener('click', () => {
        if (placeIdToDelete) { // Only act if the modal was triggered from this page
            placeIdToDelete = null;
            deleteModal.style.display = 'none';
        }
    });

    confirmDeleteBtn.addEventListener('click', () => {
        if (!placeIdToDelete) return;

        fetch(`/api/places/${placeIdToDelete}`, { method: 'DELETE' })
            .then(response => {
                if (response.ok) {
                    const cardToRemove = document.querySelector(`.delete-place-btn[data-id='${placeIdToDelete}']`).closest('.log-card');
                    if (cardToRemove) {
                        cardToRemove.remove();
                    }
                } else {
                    alert('Failed to delete place.');
                }
            })
            .catch(error => console.error('Error deleting place:', error))
            .finally(() => {
                deleteModal.style.display = 'none';
                placeIdToDelete = null;
            });
    });
});
