import type { RegisterJobInput, RegisteredJob } from '../types';
export interface JobRegistry {
    register(input: RegisterJobInput): void;
    get(name: string): RegisteredJob | undefined;
    has(name: string): boolean;
    list(): string[];
}
export declare function createRegistry(): JobRegistry;
//# sourceMappingURL=registry.d.ts.map