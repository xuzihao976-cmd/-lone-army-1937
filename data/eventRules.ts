/** Existing event IDs and option 0/1 remain stable for old records. */
export const EVENT_RULES = {
  student: { minutes: 15, pressure: 8, ammo: 600, medkitsReward: 10, maxDeaths: 15 },
  boat: { minutes: 10, pressure: 8, ammoReward: 3000, ambushChance: 0.5, minDeaths: 10, maxDeaths: 19 },
  checkedBoat: { minutes: 30, pressure: 12, ammo: 100, ammoReward: 2400, ambushChance: 0.2, maxDeaths: 5 },
  defector: { minutes: 10, pressure: 6, sabotageChance: 0.3, grenadeReward: 50, fallbackWounded: 2 },
  checkedDefector: { minutes: 20, pressure: 6, materials: 30, grenadeReward: 30 },
  truck: { minutes: 15, pressure: 15, ammoReward: 2000, maxDeaths: 5 },
  package: { minutes: 15, pressure: 10, successChance: 0.7, medkitsReward: 5, materialsReward: 100, moraleReward: 5 },
  groundRecovery: { minutes: 10, pressure: 4, materialsReward: 50 },
  returnBoat: { minutes: 15, pressure: 8, ammo: 300, machineGunAmmoReward: 1800 },
  corner: { minutes: 10, pressure: 8 },
  knocking: { minutes: 15, pressure: 10 },
  beam: { minutes: 15, pressure: 8, integrityReward: 8 },
  wetMedicine: { minutes: 15, pressure: 6, maxLoss: 2 },
  hmgRepair: { minutes: 30, pressure: 8 },
  cooldownTurns: 2,
} as const;
