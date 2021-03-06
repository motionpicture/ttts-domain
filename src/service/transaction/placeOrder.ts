/**
 * 注文取引サービス
 */
import * as factory from '@motionpicture/ttts-factory';
import * as createDebug from 'debug';
import * as json2csv from 'json2csv';
import * as moment from 'moment';

import { MongoRepository as TaskRepository } from '../../repo/task';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

const debug = createDebug('ttts-domain:service');

export type ITaskAndTransactionOperation<T> = (taskRepository: TaskRepository, transactionRepo: TransactionRepo) => Promise<T>;

/**
 * ひとつの取引のタスクをエクスポートする
 */
export function exportTasks(status: factory.transactionStatusType): ITaskAndTransactionOperation<void> {
    return async (taskRepository: TaskRepository, transactionRepo: TransactionRepo) => {
        const statusesTasksExportable = [factory.transactionStatusType.Expired, factory.transactionStatusType.Confirmed];
        if (statusesTasksExportable.indexOf(status) < 0) {
            throw new factory.errors.Argument('status', `transaction status should be in [${statusesTasksExportable.join(',')}]`);
        }

        const transaction = await transactionRepo.transactionModel.findOneAndUpdate(
            {
                typeOf: factory.transactionType.PlaceOrder,
                status: status,
                tasksExportationStatus: factory.transactionTasksExportationStatus.Unexported
            },
            { tasksExportationStatus: factory.transactionTasksExportationStatus.Exporting },
            { new: true }
        ).exec()
            .then((doc) => (doc === null) ? null : <factory.transaction.placeOrder.ITransaction>doc.toObject());

        if (transaction === null) {
            return;
        }

        // 失敗してもここでは戻さない(RUNNINGのまま待機)
        await exportTasksById(transaction.id)(taskRepository, transactionRepo);

        await transactionRepo.setTasksExportedById(transaction.id);
    };
}

export function exportTasksById(transactionId: string): ITaskAndTransactionOperation<factory.task.ITask[]> {
    // tslint:disable-next-line:max-func-body-length
    return async (taskRepository: TaskRepository, transactionRepo: TransactionRepo) => {
        const transaction = await transactionRepo.findPlaceOrderById(transactionId);

        const taskAttributes: factory.task.IAttributes[] = [];

        // ウェブフックタスクを追加
        const webhookUrl =
            // tslint:disable-next-line:max-line-length
            `${process.env.TELEMETRY_API_ENDPOINT}/organizations/project/${process.env.PROJECT_ID}/tasks/analyzePlaceOrder`;
        const triggerWebhookTaskAttributes: factory.task.triggerWebhook.IAttributes = {
            name: factory.taskName.TriggerWebhook,
            status: factory.taskStatus.Ready,
            runsAt: new Date(), // なるはやで実行
            remainingNumberOfTries: 3,
            lastTriedAt: null,
            numberOfTried: 0,
            executionResults: [],
            data: {
                url: webhookUrl,
                payload: { transaction: transaction }
            }
        };
        taskAttributes.push(
            triggerWebhookTaskAttributes
        );

        switch (transaction.status) {
            case factory.transactionStatusType.Confirmed:
                taskAttributes.push(factory.task.settleSeatReservation.createAttributes({
                    status: factory.taskStatus.Ready,
                    runsAt: new Date(), // なるはやで実行
                    remainingNumberOfTries: 10,
                    lastTriedAt: null,
                    numberOfTried: 0,
                    executionResults: [],
                    data: {
                        transactionId: transaction.id
                    }
                }));
                taskAttributes.push(factory.task.settleCreditCard.createAttributes({
                    status: factory.taskStatus.Ready,
                    runsAt: new Date(), // なるはやで実行
                    remainingNumberOfTries: 10,
                    lastTriedAt: null,
                    numberOfTried: 0,
                    executionResults: [],
                    data: {
                        transactionId: transaction.id
                    }
                }));
                taskAttributes.push(factory.task.createOrder.createAttributes({
                    status: factory.taskStatus.Ready,
                    runsAt: new Date(), // なるはやで実行
                    remainingNumberOfTries: 10,
                    lastTriedAt: null,
                    numberOfTried: 0,
                    executionResults: [],
                    data: {
                        transactionId: transaction.id
                    }
                }));
                taskAttributes.push(factory.task.createPlaceOrderReport.createAttributes({
                    status: factory.taskStatus.Ready,
                    runsAt: new Date(), // なるはやで実行
                    remainingNumberOfTries: 10,
                    lastTriedAt: null,
                    numberOfTried: 0,
                    executionResults: [],
                    data: {
                        transaction: transaction
                    }
                }));

                break;

            // 期限切れの場合は、タスクリストを作成する
            case factory.transactionStatusType.Expired:
                taskAttributes.push(factory.task.cancelSeatReservation.createAttributes({
                    status: factory.taskStatus.Ready,
                    runsAt: new Date(), // なるはやで実行
                    remainingNumberOfTries: 10,
                    lastTriedAt: null,
                    numberOfTried: 0,
                    executionResults: [],
                    data: {
                        transactionId: transaction.id
                    }
                }));
                taskAttributes.push(factory.task.cancelCreditCard.createAttributes({
                    status: factory.taskStatus.Ready,
                    runsAt: new Date(), // なるはやで実行
                    remainingNumberOfTries: 10,
                    lastTriedAt: null,
                    numberOfTried: 0,
                    executionResults: [],
                    data: {
                        transactionId: transaction.id
                    }
                }));

                break;

            default:
                throw new factory.errors.NotImplemented(`Transaction status "${transaction.status}" not implemented.`);
        }
        debug('taskAttributes prepared', taskAttributes);

        return Promise.all(taskAttributes.map(async (taskAttribute) => {
            return taskRepository.save(taskAttribute);
        }));
    };
}

/**
 * 確定取引についてメールを送信する
 * @export
 * @function
 * @memberof service.transaction.placeOrder
 * @param transactionId 取引ID
 * @param emailMessageAttributes Eメールメッセージ属性
 */
export function sendEmail(
    transactionId: string,
    emailMessageAttributes: factory.creativeWork.message.email.IAttributes
): ITaskAndTransactionOperation<factory.task.sendEmailNotification.ITask> {
    return async (taskRepo: TaskRepository, transactionRepo: TransactionRepo) => {
        const transaction = await transactionRepo.findPlaceOrderById(transactionId);
        if (transaction.status !== factory.transactionStatusType.Confirmed) {
            throw new factory.errors.Forbidden('Transaction not confirmed.');
        }

        const emailMessage = factory.creativeWork.message.email.create({
            identifier: `placeOrderTransaction-${transactionId}`,
            sender: {
                typeOf: transaction.seller.typeOf,
                name: emailMessageAttributes.sender.name,
                email: emailMessageAttributes.sender.email
            },
            toRecipient: {
                typeOf: transaction.agent.typeOf,
                name: emailMessageAttributes.toRecipient.name,
                email: emailMessageAttributes.toRecipient.email
            },
            about: emailMessageAttributes.about,
            text: emailMessageAttributes.text
        });

        // その場で送信ではなく、DBにタスクを登録
        const taskAttributes = factory.task.sendEmailNotification.createAttributes({
            status: factory.taskStatus.Ready,
            runsAt: new Date(), // なるはやで実行
            remainingNumberOfTries: 10,
            lastTriedAt: null,
            numberOfTried: 0,
            executionResults: [],
            data: {
                transactionId: transactionId,
                emailMessage: emailMessage
            }
        });

        return <factory.task.sendEmailNotification.ITask>await taskRepo.save(taskAttributes);
    };
}

/**
 * フォーマット指定でダウンロード
 * @export
 * @function
 * @memberof service.transaction.placeOrder
 * @param conditions 検索条件
 * @param format フォーマット
 */
export function download(
    conditions: {
        startFrom: Date;
        startThrough: Date;
    },
    format: 'csv'
) {
    return async (transactionRepo: TransactionRepo): Promise<string> => {
        // 取引検索
        const transactions = await transactionRepo.searchPlaceOrder(conditions);
        debug('transactions:', transactions);

        // 取引ごとに詳細を検索し、csvを作成する
        const data = await Promise.all(transactions.map(async (transaction) => transaction2report(transaction)));
        debug('data:', data);

        if (format === 'csv') {
            return new Promise<string>((resolve) => {
                const fields = [
                    'id', 'status', 'startDate', 'endDate',
                    'customer.name', 'customer.email', 'customer.telephone', 'customer.memberOf.membershipNumber',
                    'eventName', 'eventStartDate', 'eventEndDate', 'superEventLocationBranchCode', 'superEventLocation', 'eventLocation',
                    'reservedTickets', 'orderNumber', 'confirmationNumber', 'price',
                    'paymentMethod.0', 'paymentMethodId.0',
                    'paymentMethod.1', 'paymentMethodId.1',
                    'paymentMethod.2', 'paymentMethodId.2',
                    'paymentMethod.3', 'paymentMethodId.3',
                    'discounts.0', 'discountCodes.0', 'discountPrices.0',
                    'discounts.1', 'discountCodes.1', 'discountPrices.1',
                    'discounts.2', 'discountCodes.2', 'discountPrices.2',
                    'discounts.3', 'discountCodes.3', 'discountPrices.3'
                ];
                const fieldNames = [
                    '取引ID', '取引ステータス', '開始日時', '終了日時',
                    'お名前', 'メールアドレス', '電話番号', '会員ID',
                    'イベント名', 'イベント開始日時', 'イベント終了日時', '劇場コード', '劇場名', 'スクリーン名',
                    '予約座席チケット', '注文番号', '確認番号', '金額',
                    '決済方法1', '決済ID1', '決済方法2', '決済ID2', '決済方法3', '決済ID3', '決済方法4', '決済ID4',
                    '割引1', '割引コード1', '割引金額1', '割引2', '割引コード2', '割引金額2', '割引3', '割引コード3', '割引金額3', '割引4', '割引コード4', '割引金額4'
                ];
                const output = json2csv(<any>{
                    data: data,
                    fields: fields,
                    fieldNames: fieldNames,
                    del: ',',
                    newLine: '\n',
                    flatten: true,
                    preserveNewLinesInValues: true
                });
                debug('output:', output);

                resolve(output);
            });
        } else {
            throw new factory.errors.NotImplemented('specified format not implemented.');
        }
    };
}

/**
 * 取引レポートインターフェース
 * @export
 * @interface
 * @memberof service.transaction.placeOrder
 */
export interface ITransactionReport {
    id: string;
    status: string;
    startDate: string;
    endDate: string;
    customer: {
        name: string;
        email: string;
        telephone: string;
        group: string;
        memberOf?: {
            membershipNumber: string;
        };
    };
    eventName: string;
    eventStartDate: string;
    eventEndDate: string;
    superEventLocationBranchCode: string;
    superEventLocation: string;
    eventLocation: string;
    reservedTickets: string;
    orderNumber: string;
    confirmationNumber: string;
    price: string;
    paymentMethod: string[];
    paymentMethodId: string[];
    discounts: string[];
    discountCodes: string[];
    discountPrices: string[];
}

export function transaction2report(transaction: factory.transaction.placeOrder.ITransaction): ITransactionReport {
    if (transaction.result !== undefined) {
        const order = transaction.result.order;
        const reservations = transaction.result.order.acceptedOffers.map((o) => o.itemOffered);
        const ticketsStr = reservations.map((r) => {
            let price = 0;
            if (r.reservedTicket.ticketType.priceSpecification !== undefined) {
                price = r.reservedTicket.ticketType.priceSpecification.price;
            }

            // tslint:disable-next-line:max-line-length
            return `${(r.reservedTicket.ticketedSeat !== undefined) ? r.reservedTicket.ticketedSeat.seatNumber : 'No seat'} ${r.reservedTicket.ticketType.name.ja} ￥${price} [${r.id}]`;
        }).join('\n');

        return {
            id: transaction.id,
            status: transaction.status,
            startDate: (transaction.startDate !== undefined) ? transaction.startDate.toISOString() : '',
            endDate: (transaction.endDate !== undefined) ? transaction.endDate.toISOString() : '',
            customer: {
                name: order.customer.name,
                email: order.customer.email,
                telephone: (order.customer.telephone !== undefined) ? order.customer.telephone : '',
                group: transaction.object.purchaser_group
            },
            eventName: (reservations[0].reservationFor.superEvent !== undefined
                && reservations[0].reservationFor.superEvent.name !== undefined)
                ? reservations[0].reservationFor.superEvent.name.ja
                : '',
            eventStartDate: moment(reservations[0].reservationFor.startDate).toISOString(),
            eventEndDate: moment(reservations[0].reservationFor.endDate).toISOString(),
            superEventLocationBranchCode: '',
            superEventLocation: reservations[0].reservationFor.superEvent.location.name.ja,
            eventLocation: (reservations[0].reservationFor.location !== undefined)
                ? reservations[0].reservationFor.location.name.ja
                : '',
            reservedTickets: ticketsStr,
            orderNumber: order.orderNumber,
            confirmationNumber: order.confirmationNumber.toString(),
            price: `${order.price} ${order.priceCurrency}`,
            paymentMethod: order.paymentMethods.map((method) => method.name),
            paymentMethodId: order.paymentMethods.map((method) => method.paymentMethodId),
            discounts: order.discounts.map((discount) => discount.name),
            discountCodes: order.discounts.map((discount) => discount.discountCode),
            discountPrices: order.discounts.map((discount) => `${discount.discount} ${discount.discountCurrency}`)
        };
    } else {
        const customerContact = transaction.object.customerContact;

        return {
            id: transaction.id,
            status: transaction.status,
            startDate: (transaction.startDate !== undefined) ? transaction.startDate.toISOString() : '',
            endDate: (transaction.endDate !== undefined) ? transaction.endDate.toISOString() : '',
            customer: {
                name: (customerContact !== undefined) ? `${customerContact.last_name} ${customerContact.first_name}` : '',
                email: (customerContact !== undefined) ? customerContact.email : '',
                telephone: (customerContact !== undefined) ? customerContact.tel : '',
                group: transaction.object.purchaser_group
            },
            eventName: '',
            eventStartDate: '',
            eventEndDate: '',
            superEventLocationBranchCode: '',
            superEventLocation: '',
            eventLocation: '',
            reservedTickets: '',
            orderNumber: '',
            confirmationNumber: '',
            price: '',
            paymentMethod: [],
            paymentMethodId: [],
            discounts: [],
            discountCodes: [],
            discountPrices: []
        };
    }
}
