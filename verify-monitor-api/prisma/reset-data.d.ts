interface ResetOptions {
    skipConfirmation?: boolean;
    reseedServices?: boolean;
    preserveUsers?: boolean;
}
declare function resetDatabaseData(options?: ResetOptions): Promise<void>;
declare function reseedEssentialData(): Promise<void>;
export { resetDatabaseData, reseedEssentialData };
//# sourceMappingURL=reset-data.d.ts.map