import { describe, it, expect } from 'vitest';
import { WeatherSystem } from '../src/environment/WeatherSystem';
import { EventBus } from '../src/ecs/EventBus';

describe('Dynamic Weather Lifecycle & Precipitations (S13)', () => {
  it('transitions weather parameters and accumulates wetness during rain', () => {
    const eventBus = new EventBus();
    const weather = new WeatherSystem(eventBus);

    expect(weather.currentWeather).toBe('clear');
    expect(weather.wetness).toBe(0);

    // Transition to rain over 1.0s
    weather.setWeather('rain', 1.0);

    for (let i = 0; i < 30; i++) {
      weather.update(0.1);
    }

    expect(weather.rainIntensity).toBeGreaterThan(0.5);
    expect(weather.wetness).toBeGreaterThan(0.1);

    // Transition back to clear -> wetness should begin drying
    weather.setWeather('clear', 1.0);
    for (let i = 0; i < 40; i++) {
      weather.update(0.1);
    }

    expect(weather.rainIntensity).toBeLessThan(0.3);
  });

  it('triggers storm lightning events during storm weather', () => {
    const eventBus = new EventBus();
    const lightningEvents: any[] = [];
    eventBus.on('weather_lightning', (payload) => lightningEvents.push(payload));

    const weather = new WeatherSystem(eventBus);
    weather.currentWeather = 'storm';

    // Simulate 20 seconds of storm
    for (let i = 0; i < 200; i++) {
      weather.update(0.1);
    }

    expect(lightningEvents.length).toBeGreaterThan(0);
    expect(lightningEvents[0].intensity).toBeGreaterThan(0);
  });
});
