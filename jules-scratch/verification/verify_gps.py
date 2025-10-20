import re
from playwright.sync_api import Page, expect

def test_automatic_gps_tracking(page: Page):
    # Mock the Capacitor Geolocation plugin
    page.evaluate("""
        window.Capacitor = {
            isNativePlatform: () => true,
            Plugins: {
                Geolocation: {
                    checkPermissions: () => Promise.resolve({ location: 'granted' }),
                    requestPermissions: () => Promise.resolve({ location: 'granted' }),
                    watchPosition: (options, callback) => {
                        // Simulate a location update every second
                        const watchId = setInterval(() => {
                            callback({
                                coords: {
                                    latitude: -21.17,
                                    longitude: -48.45,
                                    accuracy: 10,
                                    altitude: 100,
                                    altitudeAccuracy: 10,
                                    heading: 0,
                                    speed: 0
                                },
                                timestamp: Date.now()
                            });
                        }, 1000);
                        return Promise.resolve(watchId);
                    },
                    clearWatch: (options) => {
                        clearInterval(options.id);
                        return Promise.resolve();
                    }
                },
                StatusBar: {
                    setOverlaysWebView: () => {}
                },
                PushNotifications: {
                    checkPermissions: () => Promise.resolve({ receive: 'granted' }),
                    requestPermissions: () => Promise.resolve({ receive: 'granted' }),
                    register: () => Promise.resolve(),
                    addListener: () => {}
                }
            }
        };
    """)

    # Mock the backend API
    page.route("**/api/track", lambda route: route.fulfill(
        status=200,
        body="OK"
    ))

    # Load the app
    page.goto("http://localhost:8000/index.html")

    # Check for the alert indicating that tracking has started
    expect(page.locator("#alertContainer")).to_have_text("Rastreamento GPS iniciado.")

    # Wait for a location update to be sent to the backend
    with page.expect_response("**/api/track") as response_info:
        print("Waiting for location update...")

    print("Location update sent to the backend.")
