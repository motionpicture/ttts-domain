/**
 * パフォーマンス情報をRedisに保管するサンプル
 * @ignore
 */

const ttts = require('../lib/index');
const moment = require('moment');

ttts.mongoose.connect(process.env.MONGOLAB_URI, { useMongoClient: true });

const redisClient = ttts.redis.createClient(
    parseInt(process.env.TEST_REDIS_PORT, 10),
    process.env.TEST_REDIS_HOST,
    {
        password: process.env.TEST_REDIS_KEY,
        tls: { servername: process.env.TEST_REDIS_HOST }
    });

const performanceRepo = new ttts.repository.Performance(ttts.mongoose.connection);
const performanceStatusesRepo = new ttts.repository.PerformanceStatuses(redisClient)
const seatReservationOfferAvailabilityRepo = new ttts.repository.itemAvailability.SeatReservationOffer(redisClient);
const performanceWithAggregationRepo = new ttts.repository.PerformanceWithAggregation(redisClient);
const ownerRepo = new ttts.repository.Owner(ttts.mongoose.connection);
const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);

ttts.service.performance.aggregateCounts({
    startFrom: moment().toDate(),
    startThrough: moment().add(90, 'days').toDate()
})
    (performanceRepo, reservationRepo, ownerRepo, performanceWithAggregationRepo)
    .then(async () => {
        const performancesOnRedis = await performanceWithAggregationRepo.findAll();
        console.log('performances on redis found.', performancesOnRedis[0]);
        console.log('performances on redis found.', performancesOnRedis.length);

        ttts.mongoose.disconnect();
        redisClient.quit();
    });