import * as fs from 'fs/promises';
import * as path from 'path';
import pino from 'pino';

const logger = pino();

export type JobResult = {
    jobId: string;
    status: 'completed' | 'failed';
    analysis?: any;
    error?: string;
};

export class JsonStore {
    private storeDir: string;

    constructor(storeDir?: string) {
        this.storeDir = storeDir || process.env.JOB_STORE_DIR || 'var/store/jobs';
    }

    async saveJobResult(jobId: string, result: JobResult): Promise<void> {
        const filePath = path.join(this.storeDir, `${jobId}.json`);
        const tempPath = path.join(this.storeDir, `${jobId}.json.tmp`);

        try {
            await fs.mkdir(this.storeDir, { recursive: true });

            const jsonContent = JSON.stringify(result, null, 2);
            await fs.writeFile(tempPath, jsonContent, 'utf8');

            await fs.rename(tempPath, filePath);

            logger.debug({ jobId, filePath }, 'job result saved to store');
        } catch (err) {
            try {
                await fs.unlink(tempPath);
            } catch (err) {
                logger.error({ jobId, error: String(err) }, 'failed to cleanup temp file');
            }

            logger.error({ jobId, error: String(err) }, 'failed to save job result to store');
            throw err;
        }
    }


    async getJobResult(jobId: string): Promise<JobResult | null> {
        const filePath = path.join(this.storeDir, `${jobId}.json`);

        try {
            const content = await fs.readFile(filePath, 'utf8');
            const result = JSON.parse(content) as JobResult;

            logger.debug({ jobId, filePath }, 'job result read from store');
            return result;
        } catch (err: any) {
            if (err.code === 'ENOENT') {
                logger.debug({ jobId, filePath }, 'job result not found in store');
                return null;
            }

            logger.error({ jobId, filePath, error: String(err) }, 'failed to read job result from store');
            return null;
        }
    }

    async hasJobResult(jobId: string): Promise<boolean> {
        const filePath = path.join(this.storeDir, `${jobId}.json`);

        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }
}

export const jsonStore = new JsonStore();

