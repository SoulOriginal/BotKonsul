const moment = require("moment");
const axios = require("axios");
const ac = require("@antiadmin/anticaptchaofficial");
const fs = require("fs");
const  clc = require("cli-color");
const statusCodes = {
    200: "OK",
    304: "Cached data",
    401: "Unauthorized"
};

class TicketsApi {
    constructor(country, consulate, serviceCategory, service) {
        this.country = country;
        this.consulate = consulate;
        this.serviceCategory = serviceCategory;
        this.service = service;

        this.debug = true;
        this.siteURL = "https://online.mfa.gov.ua/api/v1/auth/session";
        this.siteKey = "6LcPNjgbAAAAAIp0KyR2RK_e7gb6ECDXR0n-JLqG";
        this.captchaKey = "dae2d9b395eebbd399b51df30e61b16b";

        this.fetchingToken = false;

        this.instance = axios.create({
            baseURL: 'https://online.mfa.gov.ua/api/v1/',
            timeout: 5000
        });

        ac.setAPIKey(this.captchaKey);
        this.loadSavedToken();
        this.updateAuthToken()
    }

    async getCountryId() {
        try {
            const response = (await this.instance.get('countries?order=shortName%2CASC&offset=0&limit=500'))?.data;
            const { meta, data } = response;

            if(meta?.items_count <= 0) {
                throw new Error('Countries not found!');
            }

            const countryId = (data.find(x => x.name.includes(this.country)))?.id;

            if(this.debug) {
                console.log('[INFO]', `Country code is: ${countryId}.`)
            }

            return countryId;
        } catch (e) {
            return 0;
        }
    }

    async getConsulateId() {
        try {
            const countryId = await this.getCountryId();

            const response = await this.instance.get(`queue/consulates?countryId=${countryId}`).then(res => res).catch(err => err);
            if(response?.response?.status === 401) {
                await this.updateAuthToken();
                return this.getConsulateId();
            }

            const { data } = response?.data;
            if(!data) return null;

            const consulateId = (data.find(x => x.shortName.includes(this.consulate)))?.id;
            if(this.debug) {
                console.log('[INFO]', `ConsulateID code is: ${consulateId}.`)
            }

            return consulateId;
        } catch (e) {
            return 0;
        }
    }

    async getServiceCategoryId() {
        try {
            const consulateId = await this.getConsulateId();

            const response = await this.instance.get(`queue/service-categories?limit=500&scheduledConsulateId=${consulateId}`).then(res => res).catch(err => err);
            if(response?.response?.status === 401) {
                await this.updateAuthToken();
                return this.getServiceCategoryId();
            }

            const { data } = response?.data;
            if(!data) return null;

            const serviceCategoryId = (data.find(x => x.name.includes(this.serviceCategory)))?.id;
            if(this.debug) {
                console.log('[INFO]', `ServiceCategoryId code is: ${serviceCategoryId}.`)
            }
            return serviceCategoryId;
        } catch (e) {

        }
    }

    /**
     * Get serviceID
     * @param scheduledOnly
     * @returns {Promise<*|null|undefined>}
     */
    async getServiceId(scheduledOnly = true) {
        try {
            // Get consulateID
            const consulateId = await this.getConsulateId();

            // Get serviceCategoryID
            const serviceCategoryId = await this.getServiceCategoryId();

            // Request queue/services (ID)
            const response = await this.instance.get(`queue/services?consulateId=${consulateId}&limit=500&serviceCategoryId=${serviceCategoryId}&scheduledOnly=${scheduledOnly}`).then(res => res).catch(err => err);

            // If status === Unauthorized, recursive request
            if(response?.response?.status === 401) {
                await this.updateAuthToken();
                return this.getServiceId();
            }

            const { data } = response?.data;
            if(!data) return null;

            const serviceId = (data.find(x => x.shortName.includes(this.service)))?.id;
            if(this.debug) {
                console.log('[INFO]', `ServiceId code is: ${serviceId}.`)
            }

            return serviceId;
        } catch (e) {

        }

    }

    /**
     * Return date/time schedules
     * @param date - start date
     * @param dateEnd - end date
     * @returns {Promise<unknown>}
     */
    async getSchedules(date = moment().format('YYYY-MM-DD'), dateEnd = moment().format('YYYY-MM-DD')) {
        try {
            // Get consulateID
            const consulateId = await this.getConsulateId();

            // Get serviceID
            const serviceId = await this.getServiceId();

            // Request schedules
            const response = await this.instance.get(`queue/consulates/${consulateId}/schedule?date=${date}&dateEnd=${dateEnd}&serviceId=${serviceId}`).then(res => res).catch(err => err);
            console.log(clc.cyan.bgWhite.blink(`?????????? ???????????????????? ${moment().format('YYYY-MM-DD hh:mm:ss a')}`));
            console.log(response.data)
            // If status === Unauthorized, recursive request
            if(response?.response?.status === 401) {
                await this.updateAuthToken();
                return this.getSchedules();
            }

            return response;
        } catch (e) {
            return { success: false, error: e.message }
        }
    }

    /**
     * Load saved auth_token (JWT) from file
     */
    loadSavedToken () {
        try {
            let file = fs.readFileSync('./auth_token.json');
            let json = JSON.parse(file || "");
            let { auth_token } = json;

            if (auth_token) {
                this.instance.defaults.headers.Authorization = `Bearer ${auth_token}`;
            }
        } catch (e) {}
    }

    /**
     * Request new auth token from site
     * @returns {Promise<void>}
     */
    async updateAuthToken() {
        try {
            if(this.fetchingToken) return;
            this.fetchingToken = true;

            // Get country ID
            const countryId = await this.getCountryId();

            // Request solved captcha GResponse
            const gresponse = await ac.solveRecaptchaV2Proxyless(this.siteURL, this.siteKey)

            // Request session JWT token
            const { token } = (await this.instance.post(`auth/session`, { "g-recaptcha-response": gresponse, countryId }).then(res => res).catch(err => err))?.data;

            // Save JWT to file
            fs.writeFileSync('./auth_token.json', JSON.stringify({
                auth_token: token,
                create_date: Date.now()
            }, null, 2));
            console.log(clc.cyan.bgWhite.bold(`?????????? ?????????????? ${moment().format('YYYY-MM-DD hh:mm:ss a')}`));
            // Change defaults headers in axios instance
            this.instance.defaults.headers.Authorization = `Bearer ${token}`;
        } catch (e) {
            console.log(e.message)
        } finally {
            this.fetchingToken = false;
        }
    }
}

module.exports = TicketsApi;