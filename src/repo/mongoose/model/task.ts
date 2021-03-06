import * as mongoose from 'mongoose';

const safe: any = { j: 1, w: 'majority', wtimeout: 10000 };

const executionResultSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);

const dataSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);

/**
 * タスクスキーマ
 * @ignore
 */
const schema = new mongoose.Schema(
    {
        name: String,
        status: String,
        runsAt: Date,
        remainingNumberOfTries: Number,
        lastTriedAt: Date,
        numberOfTried: Number,
        executionResults: [executionResultSchema],
        data: dataSchema
    },
    {
        collection: 'tasks',
        id: true,
        read: 'primaryPreferred',
        safe: safe,
        strict: true,
        useNestedStrict: true,
        timestamps: {
            createdAt: 'createdAt',
            updatedAt: 'updatedAt'
        },
        toJSON: { getters: true },
        toObject: { getters: true }
    }
);

schema.index(
    { createdAt: 1 },
    { name: 'searchByCreatedAt' }
);
schema.index(
    { updatedAt: 1 },
    { name: 'searchByUpdatedAt' }
);
schema.index(
    { name: 1 },
    { name: 'searchByName' }
);
schema.index(
    { status: 1 },
    { name: 'searchByStatus' }
);
schema.index(
    { runsAt: 1 },
    { name: 'searchByRunsAt' }
);
schema.index(
    { lastTriedAt: 1 },
    {
        name: 'searchByLastTriedAt',
        partialFilterExpression: {
            lastTriedAt: { $type: 'date' }
        }
    }
);
schema.index(
    { remainingNumberOfTries: 1 },
    { name: 'searchByRemainingNumberOfTries' }
);
schema.index(
    { numberOfTried: 1 },
    { name: 'searchByNumberOfTried' }
);

// 取引のタスク検索に使用
schema.index(
    { 'data.transactionId': 1 },
    {
        partialFilterExpression: {
            'data.transactionId': { $exists: true }
        }
    }
);

// 基本的にグループごとに、ステータスと実行日時を見て、タスクは実行される
schema.index(
    { name: 1, status: 1, numberOfTried: 1, runsAt: 1 }
);
schema.index(
    { status: 1, name: 1, lastTriedAt: 1 }
);

// ステータス&最終トライ日時&残りトライ可能回数を見て、リトライor中止を決定する
schema.index(
    { remainingNumberOfTries: 1, status: 1, lastTriedAt: 1 }
);
schema.index(
    { status: 1, remainingNumberOfTries: 1, lastTriedAt: 1 }
);

// 測定データ作成時に使用
schema.index({ createdAt: 1, lastTriedAt: 1 });
schema.index({ status: 1, createdAt: 1 });

export default mongoose.model('Task', schema)
    .on('index', (error) => {
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore next */
        if (error !== undefined) {
            // tslint:disable-next-line:no-console
            console.error(error);
        }
    });
