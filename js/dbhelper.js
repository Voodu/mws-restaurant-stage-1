/**
 * Common database helper functions.
 */
class DBHelper {
    /**
     * Database URL.
     * Change this to restaurants.json file location on your server.
     */
    static get RESTAURANTS_URL() {
        const port = 1337 // Change this to your server port
        return `http://localhost:${port}/restaurants`;
    }

    static get REVIEWS_URL() {
        const port = 1337;
        return `http://localhost:${port}/reviews`;
    }

    /**
     * Fetch all objects.
     */
    static async fetchObjects(type, callback) {
        let info = this.getInfoForType(type);
        try {
            let synced = await DBHelper.synchronizeObjects(info);
            callback(null, synced);
        }
        catch (error) {
            callback(`Fetch error: ${error}`, null);
        }
    }

    /**
     * Update object
     */
    static async updateObject(object, type, callback) {
        let info = DBHelper.getInfoForType(type, object);
        let localData;
        try {
            localData = await IDBHelper.putObject(object, info.storeName);
            let networkData = await fetch(info.updateUrl,
                {
                    method: 'PUT'
                });
            callback(null, localData || (await networkData.json()).id);
        } catch (error) {
            if (localData) {
                callback(null, localData);
                return;
            }
            callback(error, null);
        }
    }

    /**
     * Fetch an object by its ID.
     */
    static async fetchObjectById(id, type, callback) {
        let info = DBHelper.getInfoForType(type);
        try {
            let synced = await DBHelper.synchronizeObjectById(id, info);
            callback(null, synced);
        }
        catch (error) {
            callback(error, null);
        }
    }

    /**
     * Fetch restaurants by a cuisine type with proper error handling.
     */
    static fetchRestaurantByCuisine(cuisine, callback) {
        DBHelper.fetchRestaurantByCuisineAndNeighborhood(cuisine, 'all', callback);
    }

    /**
     * Fetch restaurants by a neighborhood with proper error handling.
     */
    static fetchRestaurantByNeighborhood(neighborhood, callback) {
        DBHelper.fetchRestaurantByCuisineAndNeighborhood('all', neighborhood, callback);
    }

    /**
     * Fetch restaurants by a cuisine and a neighborhood with proper error handling.
     */
    static fetchRestaurantByCuisineAndNeighborhood(cuisine, neighborhood, callback) {
        // Fetch all restaurants
        DBHelper.fetchObjects('restaurant', (error, restaurants) => {
            if (error) {
                callback(error, null);
            } else {
                let results = restaurants
                if (cuisine != 'all') { // filter by cuisine
                    results = results.filter(r => r.cuisine_type == cuisine);
                }
                if (neighborhood != 'all') { // filter by neighborhood
                    results = results.filter(r => r.neighborhood == neighborhood);
                }
                callback(null, results);
            }
        });
    }

    /**
     * Fetch a review by ID of a restaurant.
     */
    static async fetchReviewsByRestaurantId(id, callback) {
        let info = DBHelper.getInfoForType('review');
        try {
            let synced = await DBHelper.synchronizeObjects(info, `/?restaurant_id=${id}`);
            callback(null, synced);
        }
        catch (error) {
            callback(`Fetch error: ${error}`, null);
        }
    }

    /**
     * Updates IDB and network with most recent data
     */
    static async synchronizeObjects(info, extendPath = '') {
        let localData;
        try {
            localData = await IDBHelper.getObjects(info.storeName);
            let networkData = await fetch(info.generalUrl + extendPath);
            let newest = DBHelper.pickMostRecentObjects(await networkData.json(), localData);
            newest.forEach(o => {
                DBHelper.updateObject(o, info.typeName, (error, response) => {
                    if (error) {
                        console.error(error);
                    }
                });
            });

            return newest;
        } catch (error) {
            if (localData && localData.length > 0) {
                return localData;
            }

            throw error;
        }
    }

    /**
     * Updates IDB and network with most recent data
     */
    static async synchronizeObjectById(id, info) {
        let localData;
        try {
            localData = await IDBHelper.getObject(id, info.storeName);
            let networkData = await fetch(info.generalUrl + `/${id}`);
            let newest = DBHelper.pickMostRecentObject(await networkData.json(), localData);
            DBHelper.updateObject(newest, info.typeName, (error, response) => {
                if (error) {
                    console.error(error);
                }
            });

            return newest;
        } catch (error) {
            if (localData) {
                return localData;
            }

            throw error;
        }
    }

    /**
     * Fetch all neighborhoods with proper error handling.
     */
    static fetchNeighborhoods(callback) {
        // Fetch all restaurants
        DBHelper.fetchObjects('restaurant', (error, restaurants) => {
            if (error) {
                callback(error, null);
            } else {
                // Get all neighborhoods from all restaurants
                const neighborhoods = restaurants.map((v, i) => restaurants[i].neighborhood)
                // Remove duplicates from neighborhoods
                const uniqueNeighborhoods = neighborhoods.filter((v, i) => neighborhoods.indexOf(v) == i)
                callback(null, uniqueNeighborhoods);
            }
        });
    }

    /**
     * Fetch all cuisines with proper error handling.
     */
    static fetchCuisines(callback) {
        // Fetch all restaurants
        DBHelper.fetchObjects('restaurant', (error, restaurants) => {
            if (error) {
                callback(error, null);
            } else {
                // Get all cuisines from all restaurants
                const cuisines = restaurants.map((v, i) => restaurants[i].cuisine_type)
                // Remove duplicates from cuisines
                const uniqueCuisines = cuisines.filter((v, i) => cuisines.indexOf(v) == i)
                callback(null, uniqueCuisines);
            }
        });
    }

    /**
     * Restaurant page URL.
     */
    static urlForRestaurant(restaurant) {
        return (`./restaurant.html?id=${restaurant.id}`);
    }

    /**
     * Restaurant image URL.
     */
    static imageUrlForRestaurant(restaurant) {
        return (`/img/${restaurant.photograph}`);
    }

    /**
     * Map marker for a restaurant.
     */
    static mapMarkerForRestaurant(restaurant, map) {
        // https://leafletjs.com/reference-1.3.0.html#marker  
        const marker = new L.marker([restaurant.latlng.lat, restaurant.latlng.lng],
            {
                title: restaurant.name,
                alt: restaurant.name,
                url: DBHelper.urlForRestaurant(restaurant)
            })
        marker.addTo(newMap);
        return marker;
    }

    /**
     * Picks most recent objects from arrays. If something goes wrong, returns always networkData
     */
    static pickMostRecentObjects(networkData, localData) {
        let output = [];
        for (const netObj of networkData) {
            let locObj = localData.find(x => x.id == netObj.id);
            if (locObj) {
                output.push(DBHelper.pickMostRecentObject(netObj, locObj));
            } else {
                return networkData || localData;
            }
        }

        return output;
    }

    /**
     * Picks most recent object. If something goes wrong, returns always networkData
     */
    static pickMostRecentObject(networkData, localData) {
        return Date.parse(networkData.updatedAt) > localData.updatedAt ? networkData : localData;
    }

    /**
     * Get information about object with a given type
     */
    static getInfoForType(objectType, object = null) {
        switch (objectType) {
            case 'restaurant':
                return {
                    typeName: 'restaurant',
                    storeName: 'restaurants',
                    generalUrl: DBHelper.RESTAURANTS_URL,
                    updateUrl: object ? `${DBHelper.RESTAURANTS_URL}/${object.id}/?is_favorite=${object.is_favorite}` : ''
                };
            case 'review':
                return {
                    typeName: 'review',
                    storeName: 'reviews',
                    generalUrl: DBHelper.REVIEWS_URL,
                    updateUrl: object ? `${DBHelper.REVIEWS_URL}/${object.id}` : ''
                };
            default:
                return {
                    storeName: null,
                    updateUrl: null
                };
        }
    }
}