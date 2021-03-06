import * as mongoose from 'mongoose';

const safe: any = { j: 1, w: 'majority', wtimeout: 10000 };

const customerSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);

const sellerSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);

const acceptedOfferSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);

const paymentMethodSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);

const discountSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);

const orderInquiryKeySchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);

/**
 * 注文スキーマ
 * @ignore
 */
const schema = new mongoose.Schema(
    {
        typeOf: {
            type: String,
            required: true
        },
        seller: sellerSchema,
        customer: customerSchema,
        confirmationNumber: String,
        orderNumber: String,
        price: Number,
        priceCurrency: String,
        acceptedOffers: [acceptedOfferSchema],
        paymentMethods: [paymentMethodSchema],
        discounts: [discountSchema],
        url: String,
        orderStatus: String,
        orderDate: Date,
        isGift: Boolean,
        orderInquiryKey: orderInquiryKeySchema
    },
    {
        collection: 'orders',
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

// 注文照会に使用
schema.index(
    {
        'orderInquiryKey.telephone': 1,
        'orderInquiryKey.paymentNo': 1,
        'orderInquiryKey.performanceDay': 1
    },
    { name: 'orderInquiryKey' }
);

schema.index(
    { createdAt: 1 },
    { name: 'searchByCreatedAt' }
);
schema.index(
    { updatedAt: 1 },
    { name: 'searchByUpdatedAt' }
);
// 注文番号はユニークなはず
schema.index(
    { orderNumber: 1 },
    {
        unique: true,
        name: 'uniqueOrderNumber'
    }
);
schema.index(
    { 'seller.id': 1, orderDate: -1 },
    {
        name: 'searchOrdersBySellerAndOrderDate',
        partialFilterExpression: {
            'seller.id': { $exists: true }
        }
    }
);
schema.index(
    { orderDate: 1 },
    {
        name: 'searchOrdersByOrderDate'
    }
);
schema.index(
    { orderStatus: 1, orderDate: -1 },
    {
        name: 'searchOrdersByOrderStatusAndOrderDate'
    }
);
schema.index(
    { confirmationNumber: 1, orderDate: -1 },
    {
        name: 'searchOrdersByConfirmationNumberAndOrderDate',
        partialFilterExpression: {
            confirmationNumber: { $exists: true }
        }
    }
);
schema.index(
    { 'customer.typeOf': 1, orderDate: -1 },
    {
        name: 'searchByCustomerTypeOfAndOrderDate',
        partialFilterExpression: {
            'customer.typeOf': { $exists: true }
        }
    }
);
schema.index(
    { 'customer.id': 1, orderDate: -1 },
    {
        name: 'searchByCustomerIdAndOrderDate',
        partialFilterExpression: {
            'customer.id': { $exists: true }
        }
    }
);
schema.index(
    { 'customer.identifier': 1, orderDate: -1 },
    {
        name: 'searchByCustomerIdentifierAndOrderDate',
        partialFilterExpression: {
            'customer.identifier': { $exists: true }
        }
    }
);
schema.index(
    { 'customer.memberOf.membershipNumber': 1, orderDate: -1 },
    {
        name: 'searchByCustomerMemberhipNumberAndOrderDate',
        partialFilterExpression: {
            'customer.memberOf.membershipNumber': { $exists: true }
        }
    }
);
schema.index(
    { 'customer.givenName': 1, orderDate: -1 },
    {
        name: 'searchByCustomerGivenNameAndOrderDate',
        partialFilterExpression: {
            'customer.givenName': { $exists: true }
        }
    }
);
schema.index(
    { 'customer.familyName': 1, orderDate: -1 },
    {
        name: 'searchByCustomerFamilyNameAndOrderDate',
        partialFilterExpression: {
            'customer.familyName': { $exists: true }
        }
    }
);
schema.index(
    { 'customer.email': 1, orderDate: -1 },
    {
        name: 'searchByCustomerEmailAndOrderDate',
        partialFilterExpression: {
            'customer.email': { $exists: true }
        }
    }
);
schema.index(
    { 'customer.telephone': 1, orderDate: -1 },
    {
        name: 'searchByCustomerTelephoneAndOrderDate',
        partialFilterExpression: {
            'customer.telephone': { $exists: true }
        }
    }
);

schema.index(
    { 'paymentMethods.accountId': 1, orderDate: -1 },
    {
        name: 'searchByPaymentMethodsAccountId',
        partialFilterExpression: {
            'paymentMethods.accountId': { $exists: true }
        }
    }
);
schema.index(
    { 'paymentMethods.typeOf': 1, orderDate: -1 },
    {
        name: 'searchByPaymentMethodTypeAndOrderDate',
        partialFilterExpression: {
            'paymentMethods.typeOf': { $exists: true }
        }
    }
);
schema.index(
    { 'paymentMethods.paymentMethodId': 1, orderDate: -1 },
    {
        name: 'searchByPaymentMethodIdAndOrderDate',
        partialFilterExpression: {
            'paymentMethods.paymentMethodId': { $exists: true }
        }
    }
);
schema.index(
    { 'acceptedOffers.itemOffered.id': 1, orderDate: -1 },
    {
        name: 'searchByItemOfferedIdAndOrderDate',
        partialFilterExpression: {
            'acceptedOffers.itemOffered.id': { $exists: true }
        }
    }
);
schema.index(
    { 'acceptedOffers.itemOffered.reservationNumber': 1, orderDate: -1 },
    {
        name: 'searchByItemOfferedReservationNumberAndOrderDate',
        partialFilterExpression: {
            'acceptedOffers.itemOffered.reservationNumber': { $exists: true }
        }
    }
);
schema.index(
    { 'acceptedOffers.itemOffered.reservationFor.id': 1, orderDate: -1 },
    {
        name: 'searchByItemOfferedReservationForIdAndOrderDate',
        partialFilterExpression: {
            'acceptedOffers.itemOffered.reservationFor.id': { $exists: true }
        }
    }
);
schema.index(
    { 'acceptedOffers.itemOffered.reservationFor.identifier': 1, orderDate: -1 },
    {
        name: 'searchByItemOfferedReservationForIdentifierAndOrderDate',
        partialFilterExpression: {
            'acceptedOffers.itemOffered.reservationFor.identifier': { $exists: true }
        }
    }
);
schema.index(
    { 'acceptedOffers.itemOffered.reservationFor.name': 1, orderDate: -1 },
    {
        name: 'searchByItemOfferedReservationForNameAndOrderDate',
        partialFilterExpression: {
            'acceptedOffers.itemOffered.reservationFor.name': { $exists: true }
        }
    }
);
schema.index(
    { 'acceptedOffers.itemOffered.reservationFor.endDate': 1, orderDate: -1 },
    {
        name: 'searchByItemOfferedReservationForEndDateAndOrderDate',
        partialFilterExpression: {
            'acceptedOffers.itemOffered.reservationFor.endDate': { $exists: true }
        }
    }
);
schema.index(
    { 'acceptedOffers.itemOffered.reservationFor.startDate': 1, orderDate: -1 },
    {
        name: 'searchByItemOfferedReservationForStartDateAndOrderDate',
        partialFilterExpression: {
            'acceptedOffers.itemOffered.reservationFor.startDate': { $exists: true }
        }
    }
);
schema.index(
    { 'acceptedOffers.itemOffered.reservationFor.location.branchCode': 1, orderDate: -1 },
    {
        name: 'searchByItemOfferedReservationForLocationBranchCodeAndOrderDate',
        partialFilterExpression: {
            'acceptedOffers.itemOffered.reservationFor.location.branchCode': { $exists: true }
        }
    }
);
schema.index(
    { 'acceptedOffers.itemOffered.reservationFor.superEvent.id': 1, orderDate: -1 },
    {
        name: 'searchByItemOfferedReservationForLocationSuperEventIdAndOrderDate',
        partialFilterExpression: {
            'acceptedOffers.itemOffered.reservationFor.superEvent.id': { $exists: true }
        }
    }
);
schema.index(
    { 'acceptedOffers.itemOffered.reservationFor.superEvent.location.branchCode': 1, orderDate: -1 },
    {
        name: 'searchByItemOfferedReservationForLocationSuperEventLocationBranchCodeAndOrderDate',
        partialFilterExpression: {
            'acceptedOffers.itemOffered.reservationFor.superEvent.location.branchCode': { $exists: true }
        }
    }
);
schema.index(
    { 'acceptedOffers.itemOffered.reservationFor.superEvent.workPerformed.identifier': 1, orderDate: -1 },
    {
        name: 'searchByItemOfferedReservationForLocationSuperEventWorkPerformedIdentifierAndOrderDate',
        partialFilterExpression: {
            'acceptedOffers.itemOffered.reservationFor.superEvent.workPerformed.identifier': { $exists: true }
        }
    }
);

export default mongoose.model('Order', schema)
    .on('index', (error) => {
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore next */
        if (error !== undefined) {
            // tslint:disable-next-line:no-console
            console.error(error);
        }
    });
