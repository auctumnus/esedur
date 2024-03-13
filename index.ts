import { REST, Routes, Client, Events, GatewayIntentBits, SlashCommandBuilder, CommandInteraction } from 'discord.js'
import groupBy from 'object.groupby'

const token = process.env.TOKEN as string
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, readyClient => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

const random = (sides: number) => Math.floor(Math.random() * sides) + 1
const sum = (arr: number[]) => arr.reduce((acc, val) => acc + val, 0)

interface Dice {
    query: string
    amount: number
    sides: number
    modifier: number
}

enum ParseResultDiscriminator {
    Success,
    InvalidFormat,
    InvalidSides,
    InvalidAmount,
    InvalidModifier
}

interface ParseFailure {
    discriminator: ParseResultDiscriminator
}

interface ParseSuccess {
    discriminator: ParseResultDiscriminator.Success
    dice: Dice
}

const isParseSuccess = (result: ParseResult): result is ParseSuccess => result.discriminator === ParseResultDiscriminator.Success

type ParseResult = ParseSuccess | ParseFailure

const diceRegex = /((\d*)?d(\d+)([+-/*]\d+)?){1}/
const parseDiceString = (dice: string): ParseResult => {
    const match = dice.match(diceRegex)
    if (match === null) {
        return { discriminator: ParseResultDiscriminator.InvalidFormat }
    }
    const amount = match[2] ? parseInt(match[2]) : 1
    const sides = parseInt(match[3])
    const modifier = match[4] ? parseInt(match[4]) : 0
    if (isNaN(sides)) {
        return { discriminator: ParseResultDiscriminator.InvalidSides }
    }
    if (isNaN(amount)) {
        return { discriminator: ParseResultDiscriminator.InvalidAmount }
    }
    if (isNaN(modifier)) {
        return { discriminator: ParseResultDiscriminator.InvalidModifier }
    }
    return {
        discriminator: ParseResultDiscriminator.Success,
        dice: {
            amount,
            sides,
            modifier,
            query: dice
        }
    }
}

const roll = (dice: Dice) => {
    const results = Array(dice.amount).fill(0).map(() => random(dice.sides))
    const total = sum(results)
    return {
        results,
        total: total + dice.modifier
    }
}

const replier = (interaction: CommandInteraction, privateOutput: boolean) => (content: string) => {
    if (privateOutput) {
        interaction.reply({ content, ephemeral: true })
    } else {
        interaction.reply(content)
    }
}

const groupDice = (results: number[]) => groupBy(results, x => x)

const makeGroupString = (groups: Record<number, number[]>, sides: number) => {
    /*const zeroes = Array(sides).fill(0).map((_, i) => i + 1).filter(x => !groups[x])
    const ones = Object.entries(groups).filter(([k, _]) => parseInt(k) === 1).map(([k, _]) => parseInt(k))

    let noSets = ''
    if (zeroes.length > 0 && ones.length > 0) {
        noSets = `\n  - No sets of ${[...zeroes, ...ones].sort().join('s, ')}s`
    } else if(zeroes.length > 0) {
        noSets = `\n  - No sets of ${zeroes.sort().join('s, ')}s`
    } else if(ones.length > 0) {
        noSets = `\n  - No sets of ${ones.sort().join('s, ')}s`
    }*/

    // the key is the 
    
    return Object.entries(groups).filter(([_, v]) => v.length > 1).map(([key, value]) => `  - **${value.length}** ${key}s`).join('\n') //+ noSets
}

const makeOutput = (dice: Dice, grouped: boolean) => {
    const results = roll(dice)
    const groups = grouped ? groupDice(results.results) : {}
    const minimum = dice.amount + dice.modifier
    const maximum = (dice.amount * dice.sides) + dice.modifier
    const average = (maximum + minimum) / 2

    const resultsString =
        `You rolled **${dice.query}** (max is ${maximum}, min is ${minimum}, avg is ${average}):\n` +
        `- Results: **${results.results.join(', ')}**\n` +
        `- Total: **${results.total}**\n` +
        (grouped ? `- Groups:\n${makeGroupString(groups, dice.sides)}` : '')

    return resultsString
}

client.on(Events.InteractionCreate, interaction => {
	if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === 'roll') {
        const dice = interaction.options.getString('dice', true);
        const grouped = interaction.options.getBoolean('groups', false) || false;
        const privateOutput = interaction.options.getBoolean('private', false) || false;
        const reply = replier(interaction, privateOutput)
        const parsed = parseDiceString(dice)
        if(!isParseSuccess(parsed)) {
            switch (parsed.discriminator) {
                case ParseResultDiscriminator.InvalidAmount:
                    reply('Invalid amount')
                    break
                case ParseResultDiscriminator.InvalidFormat:
                    reply('Invalid format')
                    break
                case ParseResultDiscriminator.InvalidModifier:
                    reply('Invalid modifier')
                    break
                case ParseResultDiscriminator.InvalidSides:
                    reply('Invalid sides')
                    break
            }
        } else {
            reply(makeOutput(parsed.dice, true))
        }
        
    }
});

client.login(token);

const rest = new REST().setToken(token);

const deployCommands = async () => {
    try {
		console.log(`Started refreshing} application commands.`);

		// The put method is used to fully refresh all commands in the guild with the current set
		const data = await rest.put(
			Routes.applicationCommands(process.env.CLIENT_ID!),
			{ body: [
                new SlashCommandBuilder()
                    .setName('roll')
                    .setDescription('Roll some dice')
                    .addStringOption(option => option.setName('dice').setDescription('The dice to roll').setRequired(true))
                    //.addBooleanOption(option => option.setName('groups').setDescription('Group the rolls').setRequired(false))
                    .addBooleanOption(option => option.setName('private').setDescription('Private output').setRequired(false)),
            ] },
		);

		console.log(`Successfully reloaded application commands.`);
	} catch (error) {
		// And of course, make sure you catch and log any errors!
		console.error(error);
	}
}

deployCommands()