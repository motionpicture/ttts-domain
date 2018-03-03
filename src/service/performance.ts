/**
 * パフォーマンスサービス
 * @namespace service.performance
 */

import * as factory from '@motionpicture/ttts-factory';
import * as createDebug from 'debug';

import { IAvailabilitiesByTicketType } from '../repo/itemAvailability/seatReservationOffer';
import * as Models from '../repo/mongoose';
import * as repository from '../repository';

const debug = createDebug('ttts-domain:service:performance');

export interface ISearchResult {
    performances: factory.performance.IPerformanceWithAvailability[];
    numberOfPerformances: number;
    filmIds: string[];
}

export type ISearchOperation<T> = (
    performanceRepo: repository.Performance,
    performanceAvailabilityRepo: repository.itemAvailability.Performance,
    seatReservationOfferAvailabilityRepo: repository.itemAvailability.SeatReservationOffer,
    exhibitionEventOfferRepo: repository.offer.ExhibitionEvent
) => Promise<T>;

/**
 * 検索する
 * @param {ISearchConditions} searchConditions 検索条件
 * @return {ISearchOperation<ISearchResult>} 検索結果
 * @memberof service.performance
 */
export function search(searchConditions: factory.performance.ISearchConditions): ISearchOperation<ISearchResult> {
    // tslint:disable-next-line:max-func-body-length
    return async (
        performanceRepo: repository.Performance,
        performanceAvailabilityRepo: repository.itemAvailability.Performance,
        seatReservationOfferAvailabilityRepo: repository.itemAvailability.SeatReservationOffer,
        exhibitionEventOfferRepo: repository.offer.ExhibitionEvent
    ) => {
        // MongoDB検索条件を作成
        const andConditions: any[] = [
            { canceled: false }
        ];

        if (searchConditions.day !== undefined) {
            andConditions.push({ day: searchConditions.day });
        }

        if (searchConditions.theater !== undefined) {
            andConditions.push({ theater: searchConditions.theater });
        }

        if (searchConditions.screen !== undefined) {
            andConditions.push({ screen: searchConditions.screen });
        }

        if (searchConditions.performanceId !== undefined) {
            andConditions.push({ _id: searchConditions.performanceId });
        }

        // 開始日時条件
        if (searchConditions.startFrom !== undefined) {
            andConditions.push({
                start_date: { $gte: searchConditions.startFrom }
            });
        }
        if (searchConditions.startThrough !== undefined) {
            andConditions.push({
                start_date: { $lt: searchConditions.startThrough }
            });
        }

        // 作品条件を追加する
        await addFilmConditions(
            andConditions,
            (searchConditions.section !== undefined) ? searchConditions.section : null,
            (searchConditions.words !== undefined) ? searchConditions.words : null
        );

        let conditions: any = null;
        if (andConditions.length > 0) {
            conditions = { $and: andConditions };
        }
        debug('search conditions;', conditions);

        // 作品件数取得
        const filmIds = await performanceRepo.performanceModel.distinct('film', conditions).exec();

        // 総数検索
        const performancesCount = await performanceRepo.performanceModel.count(conditions).exec();

        const page = (searchConditions.page !== undefined) ? searchConditions.page : 1;
        // tslint:disable-next-line:no-magic-numbers
        const limit = (searchConditions.limit !== undefined) ? searchConditions.limit : 1000;

        const performances = await performanceRepo.performanceModel.find(conditions, '')
            .skip(limit * (page - 1)).limit(limit)
            // 上映日、開始時刻
            .setOptions({
                sort: {
                    day: 1,
                    start_time: 1
                }
            })
            .exec().then((docs) => docs.map((doc) => <factory.performance.IPerformanceWithDetails>doc.toObject()));
        debug('performances found.', performances);

        // 空席情報を追加
        const performanceAvailabilities = await performanceAvailabilityRepo.findAll();
        debug('performanceAvailabilities found.', performanceAvailabilities);

        const data: factory.performance.IPerformanceWithAvailability[] = await Promise.all(performances.map(async (performance) => {
            let ticketTypes: factory.offer.seatReservation.ITicketType[] = [];
            let remainingAttendeeCapacityForWheelchair = 0;
            let offerAvailabilities: IAvailabilitiesByTicketType = {};

            try {
                offerAvailabilities = await seatReservationOfferAvailabilityRepo.findByPerformance(performance.id);
                debug('offerAvailabilities:', offerAvailabilities);

                ticketTypes = await exhibitionEventOfferRepo.findByEventId(performance.id);

                // 本来、この時点で券種ごとに在庫を取得しているので情報としては十分だが、
                // 以前の仕様との互換性を保つために、車椅子の在庫フィールドだけ特別に作成する
                debug('check wheelchair availability...');
                const wheelchairTicketTypeIds = ticketTypes
                    .filter((t) => t.ttts_extension.category === factory.ticketTypeCategory.Wheelchair)
                    .map((t) => t.id);
                wheelchairTicketTypeIds.forEach((ticketTypeId) => {
                    // 車椅子カテゴリーの券種に在庫がひとつでもあれば、wheelchairAvailableは在庫あり。
                    if (offerAvailabilities[ticketTypeId] !== undefined && offerAvailabilities[ticketTypeId] > 0) {
                        remainingAttendeeCapacityForWheelchair = offerAvailabilities[ticketTypeId];
                    }
                });
            } catch (error) {
                // no op
            }

            return {
                id: performance.id,
                doorTime: performance.door_time,
                startDate: performance.start_date,
                endDate: performance.end_date,
                duration: performance.duration,
                tourNumber: performance.tour_number,
                evServiceStatus: performance.ttts_extension.ev_service_status,
                onlineSalesStatus: performance.ttts_extension.online_sales_status,
                // tslint:disable-next-line:no-suspicious-comment
                // TODO 値補充
                maximumAttendeeCapacity: 0,
                // tslint:disable-next-line:no-magic-numbers
                remainingAttendeeCapacity: parseInt(performanceAvailabilities[performance.id], 10),
                remainingAttendeeCapacityForWheelchair: remainingAttendeeCapacityForWheelchair,
                ticketTypes: ticketTypes.map((ticketType) => {
                    return {
                        ...ticketType,
                        ...{
                            remainingAttendeeCapacity: offerAvailabilities[ticketType.id]
                        }
                    };
                }),
                attributes: {
                    day: performance.day,
                    open_time: performance.open_time,
                    start_time: performance.start_time,
                    end_time: performance.end_time,
                    start_date: performance.start_date,
                    end_date: performance.end_date,
                    // tslint:disable-next-line:no-magic-numbers
                    seat_status: parseInt(performanceAvailabilities[performance.id], 10),
                    wheelchair_available: remainingAttendeeCapacityForWheelchair,
                    ticket_types: ticketTypes.map((ticketType) => {
                        return {
                            ...ticketType,
                            ...{
                                available_num: offerAvailabilities[ticketType.id]
                            }
                        };
                    }),
                    tour_number: performance.ttts_extension.tour_number,
                    online_sales_status: performance.ttts_extension.online_sales_status,
                    refunded_count: performance.ttts_extension.refunded_count,
                    refund_status: performance.ttts_extension.refund_status,
                    ev_service_status: performance.ttts_extension.ev_service_status
                }
            };
        }));

        return {
            performances: data,
            numberOfPerformances: performancesCount,
            filmIds: filmIds
        };
    };
}

/**
 * 作品に関する検索条件を追加する
 * @param andConditions パフォーマンス検索条件
 * @param section 作品部門
 * @param words フリーワード
 */
async function addFilmConditions(andConditions: any[], section: string | null, words: string | null): Promise<void> {
    const filmAndConditions: any[] = [];
    if (section !== null) {
        // 部門条件の追加
        filmAndConditions.push({ 'sections.code': { $in: [section] } });
    }

    // フリーワードの検索対象はタイトル(日英両方)
    // 空白つなぎでOR検索
    if (words !== null) {
        // trim and to half-width space
        const words4search = words.replace(/(^\s+)|(\s+$)/g, '').replace(/\s/g, ' ');
        const orConditions = words4search.split(' ').filter((value) => (value.length > 0)).reduce(
            (a: any[], word) => {
                return a.concat(
                    { 'name.ja': { $regex: `${word}` } },
                    { 'name.en': { $regex: `${word}` } }
                );
            },
            []
        );
        debug(orConditions);
        filmAndConditions.push({ $or: orConditions });
    }

    // 条件があれば作品検索してID条件として追加
    if (filmAndConditions.length > 0) {
        const filmIds = await Models.Film.distinct('_id', { $and: filmAndConditions }).exec();
        debug('filmIds:', filmIds);
        // 該当作品がない場合、filmIdsが空配列となりok
        andConditions.push({ film: { $in: filmIds } });
    }
}

/**
 * パフォーマンスに関する集計を行う
 * @param {ISearchConditions} searchConditions パフォーマンス検索条件
 * @param {number} ttl 集計データの保管期間(秒)
 */
export function aggregateCounts(searchConditions: factory.performance.ISearchConditions, ttl: number) {
    return async (
        checkinGateRepo: repository.place.CheckinGate,
        performanceRepo: repository.Performance,
        reservationRepo: repository.Reservation,
        performanceAvailabilityRepo: repository.itemAvailability.Performance,
        seatReservationOfferAvailabilityRepo: repository.itemAvailability.SeatReservationOffer,
        performanceWithAggregationRepo: repository.PerformanceWithAggregation,
        exhibitionEventOfferRepo: repository.offer.ExhibitionEvent
    ) => {
        // MongoDB検索条件を作成
        const andConditions: any[] = [
            { canceled: false }
        ];

        // 開始日時条件
        if (searchConditions.startFrom !== undefined) {
            andConditions.push({
                start_date: { $gte: searchConditions.startFrom }
            });
        }
        if (searchConditions.startThrough !== undefined) {
            andConditions.push({
                start_date: { $lt: searchConditions.startThrough }
            });
        }

        const performances = await performanceRepo.performanceModel.find(
            { $and: andConditions },
            // 集計作業はデータ量次第で時間コストを気にする必要があるので、必要なフィールドのみ取得
            'door_time start_date end_date duration screen tour_number ttts_extension'
        )
            // 必要なのはスクリーン情報
            .populate('screen')
            .exec().then((docs) => docs.map((doc) => <factory.performance.IPerformanceWithDetails>doc.toObject()));
        debug(performances.length, 'performances found.');

        // 販売情報を取得
        const offersByEvent = await exhibitionEventOfferRepo.findAll();

        // 予約情報取得
        const reservations = await reservationRepo.reservationModel.find(
            {
                performance: { $in: performances.map((p) => p.id) },
                status: factory.reservationStatusType.ReservationConfirmed
            },
            // 集計作業はデータ量次第で時間コストを気にする必要があるので、必要なフィールドのみ取得
            'performance checkins ticket_type ticket_ttts_extension'
        ).exec().then((docs) => docs.map((doc) => <factory.reservation.event.IReservation>doc.toObject()));
        debug(reservations.length, 'reservations found.');

        // 入場ゲート取得
        const checkGates = await checkinGateRepo.findAll();
        debug(checkGates.length, 'checkGates found.');

        // パフォーマンスごとの在庫状況
        const performanceAvailabilities = await performanceAvailabilityRepo.findAll();
        debug(Object.keys(performanceAvailabilities).length, 'performanceAvailabilities found.');

        // パフォーマンスごとに集計
        debug('creating aggregations...');
        const aggregations: factory.performance.IPerformanceWithAggregation[] = [];
        // tslint:disable-next-line:max-func-body-length
        await Promise.all(performances.map(async (performance) => {
            try {
                const reservations4performance = reservations.filter((r) => r.performance === performance.id);
                let offers = offersByEvent[performance.id];
                if (offers === undefined) {
                    offers = [];
                }

                const offerAvailabilities = await seatReservationOfferAvailabilityRepo.findByPerformance(performance.id);

                // 残席数
                let remainingAttendeeCapacity = 0;
                if (performanceAvailabilities[performance.id] !== undefined) {
                    remainingAttendeeCapacity = parseInt(performanceAvailabilities[performance.id], 10);
                }

                // 本来、この時点で券種ごとに在庫を取得しているので情報としては十分だが、
                // 以前の仕様との互換性を保つために、車椅子の在庫フィールドだけ特別に作成する
                const wheelchairOffers = offers.filter((o) => o.ttts_extension.category === factory.ticketTypeCategory.Wheelchair);
                let remainingAttendeeCapacityForWheelchair = 0;
                wheelchairOffers.forEach((offer) => {
                    // 車椅子カテゴリーの券種に在庫がひとつでもあれば、wheelchairAvailableは在庫あり。
                    if (offerAvailabilities[offer.id] !== undefined && offerAvailabilities[offer.id] > 0) {
                        remainingAttendeeCapacityForWheelchair = offerAvailabilities[offer.id];
                    }

                    // 車椅子券種の場合、同伴者必須を考慮して、そもそもremainingAttendeeCapacityが0であれば0
                    if (remainingAttendeeCapacity < offer.ttts_extension.required_seat_num + 1) {
                        remainingAttendeeCapacityForWheelchair = 0;
                    }
                });

                // 券種ごと(販売情報ごと)の予約数を集計
                const reservationCountsByTicketType = offers.map((offer) => {
                    return {
                        ticketType: offer.id,
                        count: reservations4performance.filter((r) => r.ticket_type === offer.id).length
                    };
                });

                // 入場数の集計を行う
                const checkinCountAggregation = await aggregateCheckinCount(checkGates, reservations4performance, offers);

                const aggregation: factory.performance.IPerformanceWithAggregation = {
                    id: performance.id,
                    doorTime: performance.door_time,
                    startDate: performance.start_date,
                    endDate: performance.end_date,
                    duration: performance.duration,
                    maximumAttendeeCapacity: performance.screen.sections.reduce((a, b) => a + b.seats.length, 0),
                    remainingAttendeeCapacity: remainingAttendeeCapacity,
                    remainingAttendeeCapacityForWheelchair: remainingAttendeeCapacityForWheelchair,
                    tourNumber: performance.tour_number,
                    evServiceStatus: performance.ttts_extension.ev_service_status,
                    onlineSalesStatus: performance.ttts_extension.online_sales_status,
                    reservationCount: reservations4performance.length,
                    checkinCount: checkinCountAggregation.checkinCount,
                    reservationCountsByTicketType: reservationCountsByTicketType,
                    checkinCountsByWhere: checkinCountAggregation.checkinCountsByWhere
                };

                // 集計リストに追加
                aggregations.push(aggregation);
            } catch (error) {
                console.error('couldn\'t create aggregation on performance', performance.id, error);
            }
        }));

        await performanceWithAggregationRepo.store(aggregations, ttl);
    };
}

/**
 * 入場数の集計を行う
 * @param checkinGates 入場ゲートリスト
 * @param reservations 予約リスト
 * @param offers 販売情報リスト
 */
export async function aggregateCheckinCount(
    checkinGates: factory.place.checkinGate.IPlace[],
    reservations: factory.reservation.event.IReservation[],
    offers: factory.offer.seatReservation.ITicketType[]
): Promise<{
    checkinCount: number;
    checkinCountsByWhere: factory.performance.ICheckinCountByWhere[];
}> {
    // 全予約の入場履歴をマージ
    const allCheckins: factory.performance.ICheckinWithTicketType[] = reservations.reduce(
        (a, b) => {
            const checkins = b.checkins.map((c) => {
                return {
                    ...c,
                    ticketType: b.ticket_type,
                    ticketCategory: b.ticket_ttts_extension.category
                };
            });

            return [...a, ...checkins];
        },
        []
    );

    // 同一ポイントでの重複チェックインを除外
    // チェックポイントに現れた物理的な人数を数えるのが目的なのでチェックイン行為の重複を場外
    const checkinWheres = allCheckins.map((c) => c.where);
    const uniqueCheckins = allCheckins.filter((c, pos) => checkinWheres.indexOf(c.where) === pos);

    // 入場ゲートごとに、券種ごとの入場者数を算出する
    const checkinCountsByWhere = checkinGates.map((checkinGate) => {
        // この入場ゲートの入場履歴
        const uniqueCheckins4where = uniqueCheckins.filter((c) => c.where === checkinGate.identifier);

        return {
            where: checkinGate.identifier,
            checkinCountsByTicketType: offers.map((offer) => {
                return {
                    ticketType: offer.id,
                    ticketCategory: offer.ttts_extension.category,
                    // この券種の入場履歴数を集計
                    count: uniqueCheckins4where.filter((c) => c.ticketType === offer.id).length
                };
            })
        };
    });

    return {
        checkinCount: uniqueCheckins.length,
        checkinCountsByWhere: checkinCountsByWhere
    };
}
