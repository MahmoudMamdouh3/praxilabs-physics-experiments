export type PhysicsState = Record<string, number>;
export type DerivativeFn = (state: PhysicsState, params: Record<string, number>) => PhysicsState;

export interface IIntegrator {
  readonly id: string;
  readonly name: string;
  step(state: PhysicsState, derivative: DerivativeFn, params: Record<string, number>, dt: number): PhysicsState;
}

export class ExplicitEulerIntegrator implements IIntegrator {
  readonly id = 'explicit-euler';
  readonly name = 'Explicit Euler';

  step(state: PhysicsState, derivative: DerivativeFn, params: Record<string, number>, dt: number): PhysicsState {
    const d = derivative(state, params);
    const nextState = { ...state };
    for (const key of Object.keys(state)) {
      nextState[key] += d[key] * dt;
    }
    return nextState;
  }
}

export class SemiImplicitEulerIntegrator implements IIntegrator {
  readonly id = 'semi-implicit-euler';
  readonly name = 'Semi-Implicit Euler (Symplectic)';

  step(state: PhysicsState, derivative: DerivativeFn, params: Record<string, number>, dt: number): PhysicsState {
    const nextState = { ...state };
    // By iterating through the keys and using the partially updated state for the next derivative evaluation,
    // this acts as a Gauss-Seidel update. If velocities are defined before positions in the state object,
    // this perfectly reproduces Velocity-First Symplectic (Semi-Implicit) Euler.
    for (const key of Object.keys(state)) {
      const d = derivative(nextState, params);
      nextState[key] += d[key] * dt;
    }
    return nextState;
  }
}

export class RK4Integrator implements IIntegrator {
  readonly id = 'rk4';
  readonly name = 'Runge-Kutta 4 (RK4)';

  step(state: PhysicsState, derivative: DerivativeFn, params: Record<string, number>, dt: number): PhysicsState {
    const keys = Object.keys(state);
    
    const k1 = derivative(state, params);
    
    const s2 = { ...state };
    for (const key of keys) s2[key] = state[key] + k1[key] * (dt / 2);
    const k2 = derivative(s2, params);

    const s3 = { ...state };
    for (const key of keys) s3[key] = state[key] + k2[key] * (dt / 2);
    const k3 = derivative(s3, params);

    const s4 = { ...state };
    for (const key of keys) s4[key] = state[key] + k3[key] * dt;
    const k4 = derivative(s4, params);

    const nextState = { ...state };
    for (const key of keys) {
      nextState[key] += (dt / 6) * (k1[key] + 2 * k2[key] + 2 * k3[key] + k4[key]);
    }
    
    return nextState;
  }
}

export const INTEGRATORS = [
  new SemiImplicitEulerIntegrator(),
  new ExplicitEulerIntegrator(),
  new RK4Integrator()
];
