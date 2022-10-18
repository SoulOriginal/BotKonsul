const TicketsApi = require("./TicketsApi");
const { Telegraf } = require('telegraf');
const fs = require("fs");
const  clc = require("cli-color");
const moment = require("moment");


// Configuration
const country = "Польща";
const consulate = "ГКУ в Кракові";
const serviceCategory = "Нотаріальні дії";
const service = "Заява про неперебування у шлюбі";

let bot = new Telegraf("1258358774:AAHMkxSZKzKB14jsT2RB8kh4tRPsjfEcBSM")

const subscribe = (ctx) => {
    try {
        if(fs.existsSync('./users.json')) {
            const file = fs.readFileSync('./users.json');
            const users = JSON.parse(file || "");

            fs.writeFileSync('./users.json', JSON.stringify([...users, ctx.from.id]));
        } else {
            fs.writeFileSync('./users.json', JSON.stringify([ctx.from.id], null, 2))
        }
    } catch (e) {
        console.log(e.message)
    }
}

const unSubscribe = (ctx) => {
    try {
        if(fs.existsSync('./users.json')) {
            const file = fs.readFileSync('./users.json');
            const users = JSON.parse(file || "");

            const index = users.indexOf(ctx.from.id);
            if(index !== -1) {
                users.splice(index, 1);
            }

            fs.writeFileSync('./users.json', JSON.stringify(users));
        }
    } catch (e) {
        console.log(e.message)
    }
}

const notifyUsers = async (message) => {
    try {
        if(fs.existsSync('./users.json')) {
            const file = fs.readFileSync('./users.json');
            const users = JSON.parse(file || "");

            await Promise.all(users?.map(async userId => {
                await bot.telegram.sendMessage(userId, message);
            }))
        }
    } catch (e) {
        console.log(e.message);
    }
}

(async () => {
    // Initialisation
    const Api = new TicketsApi(country, consulate, serviceCategory, service);
    bot.command('/subscribe', (ctx) => {
        subscribe(ctx);
        ctx.reply("Subscribed successfully!");
    })

    bot.command('/unsubscribe', (ctx) => {
        unSubscribe(ctx);
        ctx.reply("Unsubscribed successfully!");
    })

    bot.command('/tickets', async ctx => {
        const tickets = await Api.getSchedules();
        if(!tickets?.data?.length) {
            await ctx.reply(`Мест нет!\n Конфиг:\n ${serviceCategory}/${service}`);
            console.log(clc.cyan.bold(`/tickets Мест нет! ${moment().format('YYYY-MM-DD hh:mm:ss a')}`));
        } else {
            console.log(clc.magenta.bold(`/tickets Местa есть! ${moment().format('YYYY-MM-DD hh:mm:ss a')} /n Конфиг: /n ${serviceCategory}/${service}`));
            await ctx.reply(`Места есть!\n Конфиг:\n ${serviceCategory}/${service}`);
            await ctx.reply(JSON.stringify(tickets?.data ?? []))
        }
    })

    setInterval(async () => {
        console.log(clc.blue.bold(`setInterval Acivated ${moment().format('YYYY-MM-DD hh:mm:ss a')}`));
        let tickets = await Api.getSchedules();
        if(tickets?.data?.length) {
            await notifyUsers('Появились билеты!');
            console.log(clc.red.bold(`Появились билеты! ${moment().format('YYYY-MM-DD hh:mm:ss a')}`));
            await notifyUsers(JSON.stringify(tickets?.data ?? []))
        }
    }, 900000)

    await bot.launch()
})();