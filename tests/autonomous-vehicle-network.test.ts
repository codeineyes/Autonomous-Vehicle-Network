import { describe, it, expect, beforeEach } from 'vitest';

// Mock Clarity contract state
let vehicles = new Map<number, {
  owner: string,
  status: string,
  mileage: number,
  lastMaintenance: number,
  earnings: number
}>();

let rides = new Map<number, {
  passenger: string,
  vehicleId: number,
  startLocation: string,
  endLocation: string,
  distance: number,
  fare: number,
  status: string
}>();

let maintenanceSchedule = new Map<number, {
  nextMaintenance: number
}>();

let lastVehicleId = 0;
let lastRideId = 0;
let blockHeight = 0;

// Mock Clarity functions
function registerVehicle(caller: string): { type: string; value: number } {
  const newVehicleId = ++lastVehicleId;
  vehicles.set(newVehicleId, {
    owner: caller,
    status: "available",
    mileage: 0,
    lastMaintenance: blockHeight,
    earnings: 0
  });
  maintenanceSchedule.set(newVehicleId, {
    nextMaintenance: blockHeight + 10000
  });
  return { type: 'ok', value: newVehicleId };
}

function requestRide(caller: string, startLocation: string, endLocation: string, distance: number): { type: string; value: number | string } {
  const availableVehicle = Array.from(vehicles.entries()).find(([_, v]) => v.status === "available");
  if (!availableVehicle) {
    return { type: 'err', value: 'u101' }; // err-not-found
  }
  const [vehicleId, vehicle] = availableVehicle;
  const newRideId = ++lastRideId;
  const fare = distance * 10; // Simplified fare calculation
  rides.set(newRideId, {
    passenger: caller,
    vehicleId,
    startLocation,
    endLocation,
    distance,
    fare,
    status: "in-progress"
  });
  vehicles.set(vehicleId, { ...vehicle, status: "occupied" });
  return { type: 'ok', value: newRideId };
}

function completeRide(caller: string, rideId: number): { type: string; value: boolean } {
  const ride = rides.get(rideId);
  if (!ride) {
    return { type: 'err', value: 'u101' }; // err-not-found
  }
  const vehicle = vehicles.get(ride.vehicleId);
  if (!vehicle) {
    return { type: 'err', value: 'u101' }; // err-not-found
  }
  if (ride.status !== "in-progress") {
    return { type: 'err', value: 'u104' }; // err-invalid-state
  }
  if (vehicle.owner !== caller) {
    return { type: 'err', value: 'u102' }; // err-unauthorized
  }
  rides.set(rideId, { ...ride, status: "completed" });
  vehicles.set(ride.vehicleId, {
    ...vehicle,
    status: "available",
    mileage: vehicle.mileage + ride.distance,
    earnings: vehicle.earnings + ride.fare
  });
  return { type: 'ok', value: true };
}

function scheduleMaintenance(caller: string, vehicleId: number): { type: string; value: boolean } {
  const vehicle = vehicles.get(vehicleId);
  const schedule = maintenanceSchedule.get(vehicleId);
  if (!vehicle || !schedule) {
    return { type: 'err', value: 'u101' }; // err-not-found
  }
  if (vehicle.owner !== caller) {
    return { type: 'err', value: 'u102' }; // err-unauthorized
  }
  if (blockHeight < schedule.nextMaintenance) {
    return { type: 'err', value: 'u104' }; // err-invalid-state
  }
  vehicles.set(vehicleId, {
    ...vehicle,
    status: "maintenance",
    lastMaintenance: blockHeight
  });
  maintenanceSchedule.set(vehicleId, {
    nextMaintenance: blockHeight + 10000
  });
  return { type: 'ok', value: true };
}

function completeMaintenance(caller: string, vehicleId: number): { type: string; value: boolean } {
  const vehicle = vehicles.get(vehicleId);
  if (!vehicle) {
    return { type: 'err', value: 'u101' }; // err-not-found
  }
  if (vehicle.owner !== caller) {
    return { type: 'err', value: 'u102' }; // err-unauthorized
  }
  if (vehicle.status !== "maintenance") {
    return { type: 'err', value: 'u104' }; // err-invalid-state
  }
  vehicles.set(vehicleId, {
    ...vehicle,
    status: "available"
  });
  return { type: 'ok', value: true };
}

function distributeEarnings(caller: string, vehicleId: number): { type: string; value: boolean } {
  const vehicle = vehicles.get(vehicleId);
  if (!vehicle) {
    return { type: 'err', value: 'u101' }; // err-not-found
  }
  if (vehicle.owner !== caller) {
    return { type: 'err', value: 'u102' }; // err-unauthorized
  }
  const earnings = vehicle.earnings;
  const ownerShare = Math.floor(earnings * 0.8);
  const networkShare = earnings - ownerShare;
  // In a real implementation, we would transfer STX here
  vehicles.set(vehicleId, {
    ...vehicle,
    earnings: 0
  });
  return { type: 'ok', value: true };
}

describe('Autonomous Vehicle Network', () => {
  beforeEach(() => {
    vehicles.clear();
    rides.clear();
    maintenanceSchedule.clear();
    lastVehicleId = 0;
    lastRideId = 0;
    blockHeight = 0;
  });
  
  it('should allow vehicle registration', () => {
    const result = registerVehicle('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM');
    expect(result.type).toBe('ok');
    expect(result.value).toBe(1);
    expect(vehicles.get(1)).toBeDefined();
    expect(maintenanceSchedule.get(1)).toBeDefined();
  });
  
  it('should allow ride requests and completions', () => {
    registerVehicle('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM');
    const rideResult = requestRide('ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG', 'Start', 'End', 10);
    expect(rideResult.type).toBe('ok');
    expect(rideResult.value).toBe(1);
    
    const completeResult = completeRide('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM', 1);
    expect(completeResult.type).toBe('ok');
    expect(completeResult.value).toBe(true);
    
    const vehicle = vehicles.get(1);
    expect(vehicle?.status).toBe('available');
    expect(vehicle?.mileage).toBe(10);
    expect(vehicle?.earnings).toBe(100);
  });
  
  it('should handle maintenance scheduling and completion', () => {
    registerVehicle('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM');
    blockHeight = 10000; // Simulate time passing
    
    const scheduleResult = scheduleMaintenance('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM', 1);
    expect(scheduleResult.type).toBe('ok');
    expect(scheduleResult.value).toBe(true);
    
    const vehicle = vehicles.get(1);
    expect(vehicle?.status).toBe('maintenance');
    
    const completeResult = completeMaintenance('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM', 1);
    expect(completeResult.type).toBe('ok');
    expect(completeResult.value).toBe(true);
    
    const updatedVehicle = vehicles.get(1);
    expect(updatedVehicle?.status).toBe('available');
  });
  
  it('should distribute earnings correctly', () => {
    registerVehicle('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM');
    requestRide('ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG', 'Start', 'End', 10);
    completeRide('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM', 1);
    
    const distributeResult = distributeEarnings('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM', 1);
    expect(distributeResult.type).toBe('ok');
    expect(distributeResult.value).toBe(true);
    
    const vehicle = vehicles.get(1);
    expect(vehicle?.earnings).toBe(0);
  });
});

