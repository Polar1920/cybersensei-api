const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const Sequelize = require('sequelize');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = 'your_secret_key';

// Configuración de Sequelize
const sequelize = new Sequelize('cyber_sensei', 'root', '', {
  host: 'localhost',
  dialect: 'mysql', // Puedes cambiar a 'postgres', 'sqlite', etc.
  logging: false, // Desactiva los logs de Sequelize si lo deseas
});

// Definición de modelos
const Usuario = sequelize.define('usuarios', {
  id: {
    type: Sequelize.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  nombre: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  apellido: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  edad: Sequelize.INTEGER,
  correo: {
    type: Sequelize.STRING,
    allowNull: false,
    unique: true,
  },
  password: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  tipo: {
    type: Sequelize.ENUM('adulto', 'joven', 'niño'),
    allowNull: false,
  },
  admin: {
    type: Sequelize.BOOLEAN,
    defaultValue: false // Por defecto, los usuarios no son administradores
  },
  token_2FA: Sequelize.STRING,
  createdAt: Sequelize.DATE,
  updatedAt: Sequelize.DATE,
});

const Modulo = sequelize.define('modulos', {
  id: {
    type: Sequelize.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  nombre: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  descripcion: Sequelize.TEXT,
  imagen: Sequelize.STRING,
  orden: Sequelize.INTEGER,
  createdAt: Sequelize.DATE,
  updatedAt: Sequelize.DATE,
});

const Pagina = sequelize.define('paginas', {
  id: {
    type: Sequelize.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  nombre: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  modulo_id: {
    type: Sequelize.INTEGER,
    allowNull: false,
    references: {
      model: Modulo,
      key: 'id',
    },
  },
  orden: Sequelize.INTEGER,
  contenido0: Sequelize.STRING,
  contenido1: Sequelize.STRING,
  contenido2: Sequelize.STRING,
  tipo: {
    type: Sequelize.ENUM('inicio', 'informacion', 'quiz', 'prueba'),
    allowNull: false,
  },
  createdAt: Sequelize.DATE,
  updatedAt: Sequelize.DATE,
});

const Respuesta = sequelize.define('respuestas', {
  id: {
    type: Sequelize.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  page_id: {
    type: Sequelize.INTEGER,
    allowNull: false,
    references: {
      model: Pagina,
      key: 'id',
    },
  },
  usuario_id: {
    type: Sequelize.INTEGER,
    allowNull: false,
    references: {
      model: Usuario,
      key: 'id',
    },
  },
  correcta: Sequelize.BOOLEAN,
  createdAt: Sequelize.DATE,
  updatedAt: Sequelize.DATE,
});

// Sincronización de modelos con la base de datos
sequelize.sync({ force: false }).then(() => {
  console.log('Base de datos y tablas creadas!');
}).catch(err => {
  console.error('Error al crear la base de datos y tablas:', err);
});

// Configuración de Express
app.use(bodyParser.json());
app.use(cors());
/*
app.use(cors({
  origin: 'http://localhost:3001', // Permite solicitudes desde este origen
  methods: ['GET', 'POST', 'PUT', 'DELETE'], // Métodos permitidos
  allowedHeaders: ['Content-Type', 'Authorization'], // Cabeceras permitidas
}));
*/

// Función para generar tokens JWT
function generateToken(user) {
  return jwt.sign({ id: user.id, correo: user.correo, tipo: user.tipo }, SECRET_KEY, { expiresIn: '1h' });
}

// Nodemailer transporter para envío de correos
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'tu_correo@gmail.com',
    pass: 'tu_contraseña',
  },
});

// Rutas y controladores

// Registro de usuario
app.post('/register', async (req, res) => {
  const { nombre, apellido, correo, password, tipo } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await Usuario.create({
      nombre,
      apellido,
      correo,
      password: hashedPassword,
      tipo,
    });
    res.status(201).json({ message: 'Usuario registrado exitosamente' });
  } catch (error) {
    res.status(400).json({ message: 'Error al registrar usuario', error });
  }
});

// Login de usuario
app.post('/login', async (req, res) => {
  const { correo, password } = req.body;
  try {
    const user = await Usuario.findOne({ where: { correo } });
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Contraseña incorrecta' });
    }
    const token = generateToken(user);
    res.status(200).json({ token });
  } catch (error) {
    res.status(500).json({ message: 'Error al iniciar sesión', error });
  }
});

// Verificación en dos pasos
app.post('/verify-2fa', async (req, res) => {
  const { correo, token_2FA } = req.body;
  try {
    const user = await Usuario.findOne({ where: { correo, token_2FA } });
    if (!user) {
      return res.status(404).json({ message: 'Código de verificación incorrecto' });
    }
    const token = generateToken(user);
    res.status(200).json({ token });
  } catch (error) {
    res.status(500).json({ message: 'Error en la verificación en dos pasos', error });
  }
});

// Recuperación de cuenta
app.post('/recover', async (req, res) => {
  const { correo } = req.body;
  try {
    const user = await Usuario.findOne({ where: { correo } });
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    const token_2FA = Math.floor(100000 + Math.random() * 900000).toString();
    await user.update({ token_2FA });

    const mailOptions = {
      from: 'tu_correo@gmail.com',
      to: correo,
      subject: 'Recuperación de cuenta',
      text: `Tu código de verificación es: ${token_2FA}`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        return res.status(500).json({ message: 'Error al enviar correo de recuperación', error });
      }
      res.status(200).json({ message: 'Correo de recuperación enviado' });
    });
  } catch (error) {
    res.status(500).json({ message: 'Error en la recuperación de cuenta', error });
  }
});

// Middleware de autenticación
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(403).json({ message: 'Token requerido' });
  }
  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) {
      return res.status(401).json({ message: 'Token inválido' });
    }
    req.user = user;
    next();
  });
}

function authenticateAdmin(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) {
    return res.status(403).json({ message: 'Token requerido' });
  }
  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err || !user.admin) { // Verifica si hay un error o si el usuario no es administrador
      return res.status(401).json({ message: 'No autorizado' });
    }
    req.user = user;
    next();
  });
}

// CRUD de módulos
app.post('/modulos', authenticateToken, async (req, res) => {
  const { nombre, descripcion, imagen } = req.body;
  try {
    const newModulo = await Modulo.create({ nombre, descripcion, imagen });
    res.status(201).json(newModulo);
  } catch (error) {
    res.status(400).json({ message: 'Error al crear módulo', error });
  }
});

app.get('/modulos', authenticateToken, async (req, res) => {
  try {
    const modulos = await Modulo.findAll();
    res.status(200).json(modulos);
  } catch (error) {
    res.status(400).json({ message: 'Error al obtener módulos', error });
  }
});

app.get('/modulos/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const modulo = await Modulo.findByPk(id);
    if (!modulo) {
      return res.status(404).json({ message: 'Módulo no encontrado' });
    }
    res.status(200).json(modulo);
  } catch (error) {
    res.status(400).json({ message: 'Error al obtener módulo', error });
  }
});

app.put('/modulos/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { nombre, descripcion, imagen } = req.body;
  try {
    const modulo = await Modulo.findByPk(id);
    if (!modulo) {
      return res.status(404).json({ message: 'Módulo no encontrado' });
    }
    await modulo.update({ nombre, descripcion, imagen });
    res.status(200).json(modulo);
  } catch (error) {
    res.status(400).json({ message: 'Error al actualizar módulo', error });
  }
});

app.delete('/modulos/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const modulo = await Modulo.findByPk(id);
    if (!modulo) {
      return res.status(404).json({ message: 'Módulo no encontrado' });
    }
    await modulo.destroy();
    res.status(200).json({ message: 'Módulo eliminado' });
  } catch (error) {
    res.status(400).json({ message: 'Error al eliminar módulo', error });
  }
});

// Obtener todas las páginas de un módulo
app.get('/modulos/:modulo_id/paginas', authenticateToken, async (req, res) => {
  const { modulo_id } = req.params;
  try {
    const paginas = await Pagina.findAll({
      where: { modulo_id },
      attributes: ['id', 'nombre', 'orden']
    });
    res.status(200).json(paginas);
  } catch (error) {
    res.status(400).json({ message: 'Error al obtener páginas del módulo', error });
  }
});

// CRUD de páginas
app.post('/paginas', authenticateToken, async (req, res) => {
  const { nombre, modulo_id, orden, contenido0, tipo } = req.body;
  try {
    const newPagina = await Pagina.create({ nombre, modulo_id, orden, contenido0, tipo });
    res.status(201).json(newPagina);
  } catch (error) {
    res.status(400).json({ message: 'Error al crear página', error });
  }
});

app.get('/paginas', authenticateToken, async (req, res) => {
  try {
    const paginas = await Pagina.findAll();
    res.status(200).json(paginas);
  } catch (error) {
    res.status(400).json({ message: 'Error al obtener páginas', error });
  }
});

app.get('/paginas/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const pagina = await Pagina.findByPk(id);
    if (!pagina) {
      return res.status(404).json({ message: 'Página no encontrada' });
    }
    res.status(200).json(pagina);
  } catch (error) {
    res.status(400).json({ message: 'Error al obtener página', error });
  }
});

app.put('/paginas/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { nombre, orden, contenido0, contenido1, contenido2, tipo } = req.body;
  try {
    const pagina = await Pagina.findByPk(id);
    if (!pagina) {
      return res.status(404).json({ message: 'Página no encontrada' });
    }
    await pagina.update({ nombre, orden, contenido0, contenido1, contenido2, tipo });
    res.status(200).json(pagina);
  } catch (error) {
    res.status(400).json({ message: 'Error al actualizar página', error });
  }
});

app.delete('/paginas/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const pagina = await Pagina.findByPk(id);
    if (!pagina) {
      return res.status(404).json({ message: 'Página no encontrada' });
    }
    await pagina.destroy();
    res.status(200).json({ message: 'Página eliminada' });
  } catch (error) {
    res.status(400).json({ message: 'Error al eliminar página', error });
  }
});

// Registro y obtención de respuestas
app.post('/respuestas', authenticateToken, async (req, res) => {
  const { page_id, correcta } = req.body;
  try {
    const newRespuesta = await Respuesta.create({ page_id, usuario_id: req.user.id, correcta });
    res.status(201).json(newRespuesta);
  } catch (error) {
    res.status(400).json({ message: 'Error al registrar respuesta', error });
  }
});

app.get('/respuestas', authenticateToken, async (req, res) => {
  try {
    const respuestas = await Respuesta.findAll({ where: { usuario_id: req.user.id } });
    res.status(200).json(respuestas);
  } catch (error) {
    res.status(400).json({ message: 'Error al obtener respuestas', error });
  }
});

// Inicio del servidor
app.listen(PORT, () => {
  console.log(`Servidor API escuchando en el puerto ${PORT}`);
});
